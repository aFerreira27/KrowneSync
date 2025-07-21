'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { login } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Logo from '@/components/logo';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { KeyRound, LogIn } from 'lucide-react';
import React from "react";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending} variant="default">
      {pending ? 'Signing In...' : 'Sign In'}
      <LogIn className="ml-2 h-4 w-4" />
    </Button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useFormState(login, null);

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
             <Logo className="h-12 w-auto" />
          </div>
          <CardTitle className="font-headline text-3xl">Welcome to Synchromatic</CardTitle>
          <CardDescription>Enter your secure token to access your dashboard.</CardDescription>
        </CardHeader>
        <form action={formAction}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="token" className="flex items-center">
                <KeyRound className="mr-2 h-4 w-4" />
                API Token
              </Label>
              <Input
                id="token"
                name="token"
                type="password"
                placeholder="Enter your token here"
                required
              />
              <p className="text-xs text-muted-foreground pt-1">
                Hint: use the token "sync-me-in-42"
              </p>
            </div>
            {state?.error && (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter>
            <SubmitButton />
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
