import {
    type CanActivate,
    type ExecutionContext,
    Inject,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ENTRA_AUTH } from './tokens';
import type { EntraAuthState } from './entra-auth-state';

// No @types/express in this project (nothing else here uses @Req()) — a
// minimal structural type is enough for what this guard reads/writes.
interface RequestLike {
    headers: { authorization?: string };
    entraUser?: unknown;
}

@Injectable()
export class EntraAuthGuard implements CanActivate {
    constructor(
        @Inject(ENTRA_AUTH) private readonly auth: EntraAuthState,
        private readonly reflector: Reflector
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>(
            IS_PUBLIC_KEY,
            [context.getHandler(), context.getClass()]
        );
        if (isPublic) return true;
        if (this.auth.authMode === 'public') return true;

        const req = context.switchToHttp().getRequest<RequestLike>();
        const header = req.headers.authorization;
        const token = header?.startsWith('Bearer ')
            ? header.slice('Bearer '.length)
            : undefined;
        if (!token) {
            throw new UnauthorizedException('missing bearer token');
        }

        try {
            // verify is guaranteed non-null when authMode === 'azure-ad'
            // (see EntraAuthState's doc comment).
            req.entraUser = await this.auth.verify!(token);
        } catch {
            throw new UnauthorizedException('invalid token');
        }
        return true;
    }
}
