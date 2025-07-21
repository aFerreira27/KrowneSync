
'use client';

import { signInWithPopup, OAuthProvider } from 'firebase/auth';
import { auth } from '@/lib/firebase'; // Import initialized auth
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { LogIn } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState(auth.currentUser);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user);
      if (user) {
        router.push('/dashboard');
      }
    });
    return () => unsubscribe();
  }, [router]);


  const handleMicrosoftSignIn = () => {
    setIsLoading(true);
    const provider = new OAuthProvider('microsoft.com');
    
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
        if (error.code === 'auth/popup-closed-by-user') {
          return;
        }

        console.error('Error during Microsoft sign-in:', error.code, error.message);
        toast({
          variant: 'destructive',
          title: 'Sign-in Failed',
          description: 'Could not sign you in with Microsoft. Please check your configuration and try again.',
        });
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  if (user) {
     return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
             <Image src="/images/krowneSync.svg" alt="Synchromatic Logo" width={164} height={40} className="h-12 w-auto" />
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
