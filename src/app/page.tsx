'use client';

import { signInWithPopup, OAuthProvider } from 'firebase/auth';
import { getAuth } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import Logo from '@/components/logo';
import { LogIn } from 'lucide-react';
import React from 'react';

export default function LoginPage() {
  const router = useRouter();

  const handleMicrosoftSignIn = () => {
    const provider = new OAuthProvider('microsoft.com');
    const auth = getAuth();

    signInWithPopup(auth, provider)
      .then((result) => {
        // User signed in successfully.
        const user = result.user;
        console.log('User signed in:', user);

        // Redirect to the dashboard upon successful sign-in
        router.push('/dashboard');
      })
      .catch((error) => {
        // Handle errors during sign-in
        const errorCode = error.code;
        const errorMessage = error.message;
        console.error('Error during Microsoft sign-in:', errorCode, errorMessage);
        // Optionally, display an error message to the user
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
          <Button onClick={handleMicrosoftSignIn} className="w-full" variant="default">
            Sign in with Microsoft
            <LogIn className="ml-2 h-4 w-4" />
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
