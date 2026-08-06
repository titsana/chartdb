import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import {
    MsalProvider,
    AuthenticatedTemplate,
    UnauthenticatedTemplate,
} from '@azure/msal-react';
import { STORAGE_PROVIDER, AZURE_AD_ENABLED } from '@/lib/env';
import { msalInstance } from '@/lib/msal-config';
import { SignInPage } from '@/pages/sign-in-page/sign-in-page';
import { StorageProvider as DexieStorageProvider } from './storage-provider';
import { ApiStorageProvider } from './api-storage-provider';

const UnauthenticatedGate: React.FC = () => {
    const location = useLocation();

    if (location.pathname !== '/') {
        return <Navigate to="/" replace />;
    }

    return <SignInPage />;
};

// ponytail: single env flag, no factory/registry — add a branch here if a third backend shows up
export const StorageProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    if (STORAGE_PROVIDER !== 'api') {
        return <DexieStorageProvider>{children}</DexieStorageProvider>;
    }

    if (!AZURE_AD_ENABLED) {
        return <ApiStorageProvider>{children}</ApiStorageProvider>;
    }

    return (
        <MsalProvider instance={msalInstance}>
            <AuthenticatedTemplate>
                <ApiStorageProvider>{children}</ApiStorageProvider>
            </AuthenticatedTemplate>
            <UnauthenticatedTemplate>
                <UnauthenticatedGate />
            </UnauthenticatedTemplate>
        </MsalProvider>
    );
};
