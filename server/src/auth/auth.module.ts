import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { AzureAdStrategy } from './azure-ad.strategy';
import { AzureAdGuard } from './azure-ad.guard';
import { ConditionalAzureAdGuard } from './conditional-azure-ad.guard';

@Module({
    imports: [PassportModule],
    providers: [
        AzureAdStrategy,
        AzureAdGuard,
        { provide: APP_GUARD, useClass: ConditionalAzureAdGuard },
    ],
})
export class AuthModule {}
