
'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-10rem)]">
        <Card className="w-full max-w-lg text-center shadow-lg">
            <CardHeader>
                <div className="mx-auto bg-destructive/10 p-3 rounded-full">
                    <AlertTriangle className="h-8 w-8 text-destructive" />
                </div>
                <CardTitle className="mt-4 font-headline text-2xl">Something went wrong</CardTitle>
                <CardDescription>
                    We encountered an unexpected error while trying to load the dashboard.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">
                    You can try to refresh the page or click the button below to reset the view.
                </p>
                <pre className="mt-4 text-left bg-muted/50 p-3 rounded-md text-xs text-destructive overflow-auto max-h-40">
                    {error.message || 'An unknown error occurred.'}
                </pre>
            </CardContent>
            <CardContent>
                 <Button onClick={() => reset()}>
                    Try again
                </Button>
            </CardContent>
        </Card>
    </div>
  );
}
