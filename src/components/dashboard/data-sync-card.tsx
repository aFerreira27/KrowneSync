'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { getSyncData } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Info, Lightbulb, Loader2, RefreshCw, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto" variant="default">
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Analyzing...
        </>
      ) : (
        <>
          <RefreshCw className="mr-2 h-4 w-4" />
          Compare & Suggest
        </>
      )}
    </Button>
  );
}

const initialState = {
  summary: null,
  impact: null,
  suggestions: null,
  reasoning: null,
  error: null,
};

export function DataSyncCard() {
  const [state, formAction] = useFormState(getSyncData, initialState);
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();

  const handleSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      toast({
        title: "Synchronization Complete",
        description: "Databases have been successfully updated.",
      });
    }, 2000);
  };
  
  useEffect(() => {
    if (state?.error) {
        const errorMessages = Object.values(state.error).flat().join(' ');
        toast({
            variant: "destructive",
            title: "Validation Error",
            description: errorMessages || "An unexpected error occurred.",
        });
    }
  }, [state, toast]);

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="font-headline text-xl">Data Synchronization</CardTitle>
        <CardDescription>
          Paste product data from two platforms to identify and resolve discrepancies.
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="platformAData">Platform A Data</Label>
              <Textarea
                id="platformAData"
                name="platformAData"
                placeholder='e.g., {"name": "Product X", "price": 99.99, "color": "Blue"}'
                className="min-h-[120px] font-code"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="platformBData">Platform B Data (Source of Truth)</Label>
              <Textarea
                id="platformBData"
                name="platformBData"
                placeholder='e.g., {"name": "Product X", "price": 100.00, "color": "Navy Blue"}'
                className="min-h-[120px] font-code"
                required
              />
            </div>
          </div>

          {state?.summary && (
            <div className="space-y-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle className="font-headline">AI Summary</AlertTitle>
                <AlertDescription>{state.summary}</AlertDescription>
              </Alert>
              <Alert>
                <Lightbulb className="h-4 w-4" />
                <AlertTitle className="font-headline">Impact Assessment</AlertTitle>
                <AlertDescription>{state.impact}</AlertDescription>
              </Alert>
            </div>
          )}

          {state?.suggestions && (
             <div>
                <h3 className="font-headline text-lg mb-2">Suggested Updates for Platform A</h3>
                <div className="rounded-md border">
                <Table>
                    <TableHeader>
                    <TableRow>
                        <TableHead>Field</TableHead>
                        <TableHead>Suggested Update</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                        {state.suggestions.split('\n').map((line, index) => {
                            const [key, ...valueParts] = line.split(':');
                            const value = valueParts.join(':').trim();
                            if(!key || !value) return null;
                            return (
                                <TableRow key={index}>
                                <TableCell className="font-medium">{key.replace('- ', '').trim()}</TableCell>
                                <TableCell>{value}</TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
                </div>
                <p className="text-sm text-muted-foreground mt-2"><strong className="text-foreground">Reasoning:</strong> {state.reasoning}</p>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row items-center gap-4 justify-between border-t px-6 py-4">
          <p className="text-sm text-muted-foreground">AI will suggest changes to align Platform A with B.</p>
          <div className="flex gap-2 w-full sm:w-auto">
            <SubmitButton />
            {state?.suggestions && (
              <Button onClick={handleSync} disabled={isSyncing} variant="outline" className="w-full sm:w-auto">
                {isSyncing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {isSyncing ? 'Syncing...' : 'Apply Updates'}
              </Button>
            )}
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
