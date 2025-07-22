
'use client';

import { signInWithPopup, OAuthProvider, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase'; // Import initialized auth
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogIn } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState(auth.currentUser);

  // State for emergency email/password login
  const [showEmergencyLogin, setShowEmergencyLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);


  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user);
      if (user) {
        router.push('/dashboard');
      }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        setIsCtrlPressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        setIsCtrlPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
        unsubscribe();
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, [router]);

  const handleLogoClick = (e: React.MouseEvent) => {
    if (e.ctrlKey) {
        setShowEmergencyLogin(prev => !prev);
    }
  };

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

  const handleEmailPasswordAuth = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    signInWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        console.log('User credential:', userCredential);
        router.push('/dashboard');
    }).catch((error) => {
        let errorMessage = 'An unexpected error occurred. Please try again.';
        switch (error.code) {
            case 'auth/user-not-found':
            case 'auth/wrong-password':
            case 'auth/invalid-credential':
                errorMessage = 'Invalid email or password.';
                break;
            default:
                console.error('Email/Password Auth Error:', error);
        }
        toast({
            variant: 'destructive',
            title: 'Sign-in Failed',
            description: errorMessage,
        });
    }).finally(() => {
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
          <div 
            className={cn("mx-auto mb-4", isCtrlPressed && "cursor-pointer")} 
            onClick={handleLogoClick} 
            title="Hold CTRL and click for emergency login"
          >
             <Image src="/images/krowneSync.svg" alt="KrowneSync Logo" width={164} height={40} className="h-12 w-auto" priority />
          </div>
          <CardTitle className="font-headline text-3xl">Welcome to KrowneSync</CardTitle>
          <CardDescription>Sign in with your Microsoft account to access your dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {showEmergencyLogin && (
            <form onSubmit={handleEmailPasswordAuth} className="space-y-4 animate-in fade-in-50">
              <CardDescription className="text-center">Emergency Admin Login</CardDescription>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="m@example.com" 
                  required 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input 
                  id="password" 
                  type="password" 
                  required 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                 {isLoading ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing in...
                    </>
                    ) : (
                    'Sign In'
                )}
              </Button>
            </form>
          )}
        </CardContent>
        <CardFooter>
          {!showEmergencyLogin && (
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
          )}
        </CardFooter>
      </Card>
    </main>
  );
}
