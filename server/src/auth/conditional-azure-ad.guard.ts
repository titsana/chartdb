import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AzureAdGuard } from './azure-ad.guard';

// ponytail: Azure AD is opt-in — if the tenant/client env vars aren't set, every
// request passes through unauthenticated (today's behavior). Set both vars to enable.
@Injectable()
export class ConditionalAzureAdGuard implements CanActivate {
    constructor(
        private readonly config: ConfigService,
        private readonly azureAdGuard: AzureAdGuard
    ) {}

    canActivate(
        context: ExecutionContext
    ): boolean | Promise<boolean> | ReturnType<AzureAdGuard['canActivate']> {
        const enabled = Boolean(
            this.config.get<string>('AZURE_AD_TENANT_ID') &&
                this.config.get<string>('AZURE_AD_CLIENT_ID')
        );
        if (!enabled) {
            return true;
        }
        return this.azureAdGuard.canActivate(context);
    }
}
