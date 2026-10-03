import {
    type CanActivate,
    type ExecutionContext,
    Inject,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { ACCEPTS_MCP_TOKEN_KEY, IS_PUBLIC_KEY } from './public.decorator';
import type { McpUser } from '../mcp-auth/entra-broker';
import { ENTRA_AUTH } from './tokens';
import type { EntraAuthState } from './entra-auth-state';

// No @types/express in this project (nothing else here uses @Req()) — a
// minimal structural type is enough for what this guard reads/writes.
interface RequestLike {
    headers: { authorization?: string };
    entraUser?: unknown;
    /** Set on @AcceptsMcpToken() routes: who is calling, for tool context. */
    mcpUser?: McpUser;
}

@Injectable()
export class EntraAuthGuard implements CanActivate {
    constructor(
        @Inject(ENTRA_AUTH) private readonly auth: EntraAuthState,
        // Explicit @Inject rather than relying on implicit type-based
        // autowiring (design:paramtypes reflection) — the exact same bug
        // as ws-upgrade.service.ts's HttpAdapterHost param: `npm run dev`
        // (tsx/esbuild) leaves this undefined at runtime ("Cannot read
        // properties of undefined (reading 'getAllAndOverride')"), while
        // the compiled `dist/` build (real tsc, used by every integration
        // test) works fine — esbuild's emitDecoratorMetadata support is
        // incomplete and doesn't reliably emit this metadata for every
        // param.
        @Inject(Reflector) private readonly reflector: Reflector
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>(
            IS_PUBLIC_KEY,
            [context.getHandler(), context.getClass()]
        );
        if (isPublic) return true;
        if (this.auth.authMode === 'public') return true;

        const req = context.switchToHttp().getRequest<RequestLike>();
        const acceptsMcpToken = this.reflector.getAllAndOverride<boolean>(
            ACCEPTS_MCP_TOKEN_KEY,
            [context.getHandler(), context.getClass()]
        );
        const header = req.headers.authorization;
        const token = header?.startsWith('Bearer ')
            ? header.slice('Bearer '.length)
            : undefined;

        const mcpBroker = acceptsMcpToken ? this.auth.mcpBroker : null;
        const reject = (message: string): never => {
            // Tells MCP clients where to start the browser OAuth flow.
            if (mcpBroker) {
                const metadataUrl = getOAuthProtectedResourceMetadataUrl(
                    mcpBroker.broker.resourceUrl
                );
                context
                    .switchToHttp()
                    .getResponse<{
                        setHeader(name: string, value: string): void;
                    }>()
                    .setHeader(
                        'WWW-Authenticate',
                        `Bearer error="invalid_token", resource_metadata="${metadataUrl}"`
                    );
            }
            throw new UnauthorizedException(message);
        };
        if (!token) reject('missing bearer token');

        if (acceptsMcpToken) {
            // MCP accepts only tokens our broker issued for it (MCP spec: no
            // token passthrough). Without the broker configured, MCP is
            // unavailable in azure-ad mode rather than falling back to Entra.
            if (!mcpBroker)
                reject('MCP sign-in is not configured on this server');
            try {
                const info = await mcpBroker!.broker.verifyAccessToken(token!);
                req.mcpUser = info.extra as unknown as McpUser;
                return true;
            } catch {
                reject('invalid token');
            }
        }

        try {
            // verify is guaranteed non-null when authMode === 'azure-ad'
            // (see EntraAuthState's doc comment).
            req.entraUser = await this.auth.verify!(token!);
        } catch {
            reject('invalid token');
        }
        return true;
    }
}
