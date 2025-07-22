
'use client';

import { useActionState, useRef, useState, useEffect } from 'react';
import { useFormStatus } from 'react-dom';
import { getSyncData } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, BadgeCheck, FileWarning, Loader2, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import type { Discrepancy } from '@/lib/actions';
import { Combobox, ComboboxOption } from '@/components/ui/combobox';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto" variant="default">
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Fetching...
        </>
      ) : (
        <>
          <Search className="mr-2 h-4 w-4" />
          Fetch Product Data
        </>
      )}
    </Button>
  );
}

type SyncHistoryRecord = {
    sku: string;
    syncedAt: string;
    status: 'Synced' | 'Out of Sync';
}

const initialState: {
  productData?: any;
  discrepancies?: Discrepancy[];
  summary?: string;
  error?: string | any;
  syncedAt?: string;
} = {
  productData: null,
  discrepancies: [],
  summary: '',
  error: null,
};

function ProductDataTable({ data }: { data: Record<string, any> | null }) {
    if (!data) {
        return <p className="text-muted-foreground text-sm">No data available for this platform.</p>;
    }

    return (
        <div className="rounded-md border text-sm">
             <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[150px]">Field</TableHead>
                        <TableHead>Value</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {Object.entries(data).map(([key, value]) => (
                        <TableRow key={key}>
                            <TableCell className="font-medium capitalize">{key.replace(/_/g, ' ')}</TableCell>
                            <TableCell>{String(value)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}


export function DataSyncCard() {
  const [state, formAction] = useActionState(getSyncData, initialState);
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [productIdentifier, setProductIdentifier] = useState('');
  
  const [activeTab, setActiveTab] = useState('salesforce');
  const [searchHistory, setSearchHistory] = useState<ComboboxOption[]>([]);

  useEffect(() => {
    // Load search history from local storage
    const storedHistory = localStorage.getItem('productSearchHistory');
    if (storedHistory) {
      setSearchHistory(JSON.parse(storedHistory));
    }
  }, []);

  const handleFormSubmit = (formData: FormData) => {
    formData.set('productIdentifier', productIdentifier);
    handleFormAction(formData);
  };

  const handleFormAction = async (formData: FormData) => {
    const user = auth.currentUser;
    if (!productIdentifier) {
        toast({
            variant: "destructive",
            title: "Input Required",
            description: "Please enter a product identifier.",
        });
        return;
    }
    
    if (user) {
      try {
        const idToken = await user.getIdToken(true);
        formData.append('idToken', idToken);
        formAction(formData);
      } catch (error) {
        console.error("Error getting ID token:", error);
        toast({
          variant: "destructive",
          title: "Authentication Error",
          description: "Could not verify your session. Please sign in again.",
        });
      }
    } else {
       toast({
        variant: "destructive",
        title: "Authentication Error",
        description: "You must be signed in to perform this action.",
      });
    }
  };

  useEffect(() => {
    if (state?.error) {
      const errorMessage = typeof state.error === 'string' 
        ? state.error 
        : Object.values(state.error).flat().join(' ');

      toast({
          variant: "destructive",
          title: "Error",
          description: errorMessage || "An unexpected error occurred.",
      });
    } else if (state?.productData && state?.syncedAt) {
      // Save successful search to history
      const newHistory = [...searchHistory];
      if (!newHistory.find(item => item.value === productIdentifier.toLowerCase())) {
        newHistory.unshift({ value: productIdentifier.toLowerCase(), label: productIdentifier });
      }
      const updatedHistory = newHistory.slice(0, 10); // Limit history size
      setSearchHistory(updatedHistory);
      localStorage.setItem('productSearchHistory', JSON.stringify(updatedHistory));

      // Save to sync history for the new page
      const syncStatus: 'Synced' | 'Out of Sync' = state.discrepancies && state.discrepancies.length > 0 ? 'Out of Sync' : 'Synced';
      const syncRecord: SyncHistoryRecord = { sku: productIdentifier, syncedAt: state.syncedAt, status: syncStatus };
      const storedSyncHistoryJson = localStorage.getItem('syncHistory');
      let syncHistory: SyncHistoryRecord[] = storedSyncHistoryJson ? JSON.parse(storedSyncHistoryJson) : [];
      const existingRecordIndex = syncHistory.findIndex(r => r.sku === productIdentifier);
      if (existingRecordIndex > -1) {
          syncHistory[existingRecordIndex] = syncRecord;
      } else {
          syncHistory.unshift(syncRecord);
      }
      localStorage.setItem('syncHistory', JSON.stringify(syncHistory));


      if (state.discrepancies && state.discrepancies.length > 0) {
        setActiveTab('discrepancies');
      } else {
        setActiveTab('salesforce');
      }
    }
  }, [state, toast, productIdentifier]);

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="font-headline text-xl">Data Synchronization</CardTitle>
        <CardDescription>
          Enter a product name or SKU to fetch its data from all connected platforms and identify discrepancies.
        </CardDescription>
      </CardHeader>
      <form ref={formRef} action={handleFormSubmit}>
        <CardContent className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-grow space-y-2">
              <Label htmlFor="productIdentifier" className="sr-only">Product Name or SKU</Label>
               <Combobox
                options={searchHistory}
                value={productIdentifier}
                onChange={setProductIdentifier}
                placeholder="Enter a product SKU..."
                searchPlaceholder="Search products..."
                emptyPlaceholder="No recent products."
              />
              <input type="hidden" name="productIdentifier" value={productIdentifier} />
            </div>
            <SubmitButton />
          </div>

          {state?.productData && (
             <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="salesforce">Salesforce</TabsTrigger>
                <TabsTrigger value="salespad">Salespad</TabsTrigger>
                <TabsTrigger value="autoquotes">Autoquotes</TabsTrigger>
                <TabsTrigger value="website">Website</TabsTrigger>
                <TabsTrigger value="discrepancies" className="flex items-center gap-2">
                    <FileWarning className="h-4 w-4" />
                    Discrepancies
                    {state.discrepancies && state.discrepancies.length > 0 && (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs">
                            {state.discrepancies.length}
                        </span>
                    )}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="salesforce" className="mt-4">
                <ProductDataTable data={state.productData.salesforce} />
              </TabsContent>
              <TabsContent value="salespad" className="mt-4">
                 <ProductDataTable data={state.productData.salespad} />
              </TabsContent>
              <TabsContent value="autoquotes" className="mt-4">
                 <ProductDataTable data={state.productData.autoquotes} />
              </TabsContent>
              <TabsContent value="website" className="mt-4">
                 <ProductDataTable data={state.productData.website} />
              </TabsContent>
              <TabsContent value="discrepancies" className="mt-4 space-y-4">
                {state.discrepancies && state.discrepancies.length > 0 ? (
                    <>
                        <Alert>
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle className="font-headline">AI Analysis Complete</AlertTitle>
                            <AlertDescription>{state.summary}</AlertDescription>
                        </Alert>
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Field</TableHead>
                                        <TableHead>Salesforce</TableHead>
                                        <TableHead>Salespad</TableHead>
                                        <TableHead>Autoquotes</TableHead>
                                        <TableHead>Website</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {state.discrepancies.map((d, index) => (
                                        <TableRow key={index}>
                                            <TableCell className="font-medium capitalize">{d.field.replace(/_/g, ' ')}</TableCell>
                                            <TableCell>{d.values.salesforce || 'N/A'}</TableCell>
                                            <TableCell>{d.values.salespad || 'N/A'}</TableCell>
                                            <TableCell>{d.values.autoquotes || 'N/A'}</TableCell>
                                            <TableCell>{d.values.website || 'N/A'}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </>
                ) : (
                    <Alert>
                        <BadgeCheck className="h-4 w-4" />
                        <AlertTitle className="font-headline">No Discrepancies Found</AlertTitle>
                        <AlertDescription>The AI analysis found no conflicting data for this product across all platforms.</AlertDescription>
                    </Alert>
                )}
              </TabsContent>
            </Tabs>
          )}

        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row items-center gap-4 justify-between border-t px-6 py-4">
          <p className="text-sm text-muted-foreground">AI will analyze and flag inconsistencies across all connected platforms.</p>
        </CardFooter>
      </form>
    </Card>
  );
}
