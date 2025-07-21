'use client';

import { signInWithPopup, OAuthProvider } from 'firebase/auth';
import { auth } from '@/lib/firebase'; // Import initialized auth
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import Logo from '@/components/logo';
import { LogIn } from 'lucide-react';
import React, { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleMicrosoftSignIn = () => {
    setIsLoading(true);
    const provider = new OAuthProvider('microsoft.com');

    // Add this block to handle single-tenant apps
    const tenantId = process.env.NEXT_PUBLIC_FIREBASE_TENANT_ID;
    if (tenantId) {
      provider.setCustomParameters({
        tenant: tenantId,
      });
    }

    signInWithPopup(auth, provider)
      .then((result) => {
        const user = result.user;
        console.log('User signed in:', user);
        router.push('/dashboard');
      })
      .catch((error) => {
        // If the user closes the popup, don't show an error toast.
        if (error.code === 'auth/popup-closed-by-user') {
          setIsLoading(false);
          return;
        }

        const errorMessage = error.message;
        console.error('Error during Microsoft sign-in:', error.code, errorMessage);
        toast({
          variant: 'destructive',
          title: 'Sign-in Failed',
          description: 'Could not sign you in with Microsoft. Please try again.',
        });
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
             <Logo className="h-12 w-auto" />
          </div>
          <CardTitle className="font-headline text-3xl">Welcome to Synchromatic</CardTitle>
          <CardDescription>Sign in with your Microsoft account to access your dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* We can add a message here later if needed */}
        </CardContent>
        <CardFooter>
          <Button onClick={handleMicrosoftSignIn} className="w-full" variant="default" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                Sign in with Microsoft
                <LogIn className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
