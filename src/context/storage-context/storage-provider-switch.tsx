import React from 'react';
import { STORAGE_PROVIDER } from '@/lib/env';
import { StorageProvider as DexieStorageProvider } from './storage-provider';
import { ApiStorageProvider } from './api-storage-provider';

// ponytail: single env flag, no factory/registry — add a branch here if a third backend shows up
export const StorageProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    return STORAGE_PROVIDER === 'api' ? (
        <ApiStorageProvider>{children}</ApiStorageProvider>
    ) : (
        <DexieStorageProvider>{children}</DexieStorageProvider>
    );
};
