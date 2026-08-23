import React from 'react';
import { useMsal } from '@azure/msal-react';
import { Button } from '@/components/button/button';
import { loginRequest } from '@/lib/msal-config';

export const SignInPage: React.FC = () => {
    const { instance } = useMsal();

    return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-4">
            <h1 className="text-xl font-semibold">Sign in to ChartDB</h1>
            <Button onClick={() => instance.loginRedirect(loginRequest)}>
                Sign in with Microsoft
            </Button>
        </div>
    );
};
