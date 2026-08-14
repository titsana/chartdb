import {
    PublicClientApplication,
    type Configuration,
} from '@azure/msal-browser';
import { AZURE_AD_CLIENT_ID, AZURE_AD_TENANT_ID } from './env';

const msalConfig: Configuration = {
    auth: {
        clientId: AZURE_AD_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${AZURE_AD_TENANT_ID}`,
        redirectUri: window.location.origin,
    },
    cache: {
        cacheLocation: 'localStorage',
    },
};

export const msalInstance = new PublicClientApplication(msalConfig);

export const loginRequest = {
    scopes: [`api://${AZURE_AD_CLIENT_ID}/access_as_user`],
};
