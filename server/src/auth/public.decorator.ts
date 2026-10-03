import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Exempts a controller/handler from EntraAuthGuard even when
 * AUTH_MODE=azure-ad — used on HealthController so infra health checks
 * don't need a bearer token.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ACCEPTS_MCP_TOKEN_KEY = 'acceptsMcpToken';

/**
 * Lets EntraAuthGuard also accept a token from the MCP OAuth broker on this
 * route. Only the MCP endpoint carries it, so a broker token is rejected
 * everywhere else by construction.
 */
export const AcceptsMcpToken = () => SetMetadata(ACCEPTS_MCP_TOKEN_KEY, true);
