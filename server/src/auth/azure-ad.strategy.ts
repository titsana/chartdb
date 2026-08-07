import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { BearerStrategy, ITokenPayload } from 'passport-azure-ad';

@Injectable()
export class AzureAdStrategy extends PassportStrategy(
    BearerStrategy,
    'azure-ad'
) {
    constructor(config: ConfigService) {
        const tenantId = config.get<string>('AZURE_AD_TENANT_ID');
        const clientId = config.get<string>('AZURE_AD_CLIENT_ID');
        super({
            identityMetadata: `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`,
            clientID: clientId,
            // The access token's `aud` is the App ID URI (api://<client-id>)
            // when a custom API scope is requested, not the bare client ID.
            audience: [clientId, `api://${clientId}`],
            // Some app registrations issue v1.0-format access tokens
            // (iss without /v2.0) even when requested via the v2.0 endpoint —
            // accept both issuer forms.
            issuer: [
                `https://login.microsoftonline.com/${tenantId}/v2.0`,
                `https://sts.windows.net/${tenantId}/`,
            ],
            validateIssuer: true,
            loggingLevel: 'warn',
            // loggingNoPII: false,
            passReqToCallback: false,
        });
    }

    validate(payload: ITokenPayload): ITokenPayload {
        return payload;
    }
}
