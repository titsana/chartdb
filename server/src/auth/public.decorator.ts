import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Exempts a controller/handler from EntraAuthGuard even when
 * AUTH_MODE=azure-ad — used on HealthController so infra health checks
 * don't need a bearer token.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
