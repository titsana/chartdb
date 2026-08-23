import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EntraAuthGuard } from './entra-auth.guard';
import { buildEntraAuthState } from './entra-auth-state';
import { ENTRA_AUTH } from './tokens';

@Module({
    providers: [
        { provide: ENTRA_AUTH, useFactory: buildEntraAuthState },
        { provide: APP_GUARD, useClass: EntraAuthGuard },
    ],
    exports: [ENTRA_AUTH],
})
export class AuthModule {}
