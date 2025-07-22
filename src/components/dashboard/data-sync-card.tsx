
'use client';

import { useActionState, useRef, useState, useEffect } from 'react';
import { useFormStatus } from 'react-dom';
import { getSyncData, type ActionState } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, BadgeCheck, FileWarning, Loader2, Search, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import type { Discrepancy } from '@/lib/actions';
import { Combobox, ComboboxOption } from '@/components/ui/combobox';
import type { Platform } from '@/app/dashboard/layout';
import Image from 'next/image';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { Separator } from '@/components/ui/separator';

function SubmitButton({ atLeastOnePlatformConnected }: { atLeastOnePlatformConnected: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || !atLeastOnePlatformConnected} className="w-full sm:w-auto" variant="default">
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

const initialState: ActionState = {
  productData: undefined,
  discrepancies: [],
  summary: '',
  error: null,
};


export function DataSyncCard({ platforms }: { platforms: Platform[] }) {
  const [state, formAction] = useActionState(getSyncData, initialState);
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [productIdentifier, setProductIdentifier] = useState('');
  
  const [searchHistory, setSearchHistory] = useState<ComboboxOption[]>([]);

  const atLeastOnePlatformConnected = platforms.some(p => p.connected);
  const isWebScrapperEnabled = platforms.find(p => p.name === 'Web Scrapper')?.connected ?? false;


  useEffect(() => {
    // Load search history from local storage
    const storedHistory = localStorage.getItem('productSearchHistory');
    if (storedHistory) {
      setSearchHistory(JSON.parse(storedHistory));
    }
  }, []);

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
      if(productIdentifier) {
        const newHistory = [...searchHistory];
        if (!newHistory.find(item => item.value === productIdentifier.toLowerCase())) {
          newHistory.unshift({ value: productIdentifier.toLowerCase(), label: productIdentifier });
        }
        const updatedHistory = newHistory.slice(0, 10); // Limit history size
        setSearchHistory(updatedHistory);
        localStorage.setItem('productSearchHistory', JSON.stringify(updatedHistory));
      }

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
    }
  }, [state, toast, productIdentifier]);

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="font-headline text-xl">Data Synchronization</CardTitle>
        <CardDescription>
          Enter a product SKU to fetch its data from all connected platforms and identify discrepancies.
        </CardDescription>
      </CardHeader>
      <form ref={formRef} action={formAction}>
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
              <input type="hidden" name="includeWebScrapper" value={String(isWebScrapperEnabled)} />
            </div>
            <SubmitButton atLeastOnePlatformConnected={atLeastOnePlatformConnected} />
          </div>

          {!atLeastOnePlatformConnected && (
            <Alert variant="destructive">
                <Info className="h-4 w-4" />
                <AlertTitle>No Connections Active</AlertTitle>
                <AlertDescription>
                    Please connect at least one platform in the Connections panel before fetching data.
                </AlertDescription>
            </Alert>
          )}

          {state?.productData && (
            <Card>
                <CardContent className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                           <Carousel className="w-full">
                                <CarouselContent>
                                    {state.productData.images && state.productData.images.length > 0 ? (
                                        state.productData.images.map((img, index) => (
                                            <CarouselItem key={index}>
                                                <Image 
                                                    src={img} 
                                                    alt={`${state.productData?.name} image ${index + 1}`}
                                                    width={600}
                                                    height={400}
                                                    className="rounded-lg object-cover aspect-video"
                                                />
                                            </CarouselItem>
                                        ))
                                    ) : (
                                         <CarouselItem>
                                            <div className="bg-muted rounded-lg aspect-video flex items-center justify-center">
                                                 <p className="text-muted-foreground">No Image</p>
                                            </div>
                                         </CarouselItem>
                                    )}
                                </CarouselContent>
                                <CarouselPrevious />
                                <CarouselNext />
                            </Carousel>
                        </div>
                        <div>
                             <h2 className="text-2xl font-bold font-headline">{state.productData.name}</h2>
                             <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                                <span>SKU: {state.productData.sku}</span>
                                {state.productData.series && (
                                    <>
                                        <Separator orientation="vertical" className="h-4" />
                                        <span>Series: {state.productData.series}</span>
                                    </>
                                )}
                             </div>
                             <p className="mt-4 text-sm">{state.productData.description}</p>
                        </div>
                    </div>
                    <Separator className="my-6" />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <h3 className="font-headline font-semibold mb-3">Standard Features</h3>
                            <ul className="list-disc list-inside space-y-1 text-sm">
                                {state.productData.standardFeatures?.map(feature => <li key={feature}>{feature}</li>)}
                            </ul>
                        </div>
                        <div>
                            <h3 className="font-headline font-semibold mb-3">Compliances</h3>
                            <ul className="list-disc list-inside space-y-1 text-sm">
                                {state.productData.compliances?.map(item => <li key={item}>{item}</li>)}
                            </ul>
                        </div>
                    </div>

                    <Separator className="my-6" />

                    <div>
                        <h3 className="font-headline font-semibold mb-3">Specifications</h3>
                        <div className="rounded-md border">
                            <Table>
                                <TableBody>
                                    {state.productData.specifications?.map(spec => (
                                        <TableRow key={spec.name}>
                                            <TableCell className="font-medium">{spec.name}</TableCell>
                                            <TableCell>{spec.value}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>

                    <Separator className="my-6" />

                     <div>
                        <h3 className="font-headline font-semibold mb-3">Discrepancies</h3>
                        {state.discrepancies && state.discrepancies.length > 0 ? (
                            <>
                                <Alert>
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle className="font-headline">AI Analysis Complete</AlertTitle>
                                    <AlertDescription>{state.summary}</AlertDescription>
                                </Alert>
                                <div className="rounded-md border mt-4">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Field</TableHead>
                                                <TableHead>Salesforce</TableHead>
                                                <TableHead>Salespad</TableHead>
                                                <TableHead>Autoquotes</TableHead>
                                                <TableHead>Website</TableHead>
                                                <TableHead>Web Scrapper</TableHead>
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
                                                    <TableCell>{d.values.webscrapper || 'N/A'}</TableCell>
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
                    </div>

                </CardContent>
            </Card>
          )}

        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row items-center gap-4 justify-between border-t px-6 py-4">
          <p className="text-sm text-muted-foreground">AI will analyze and flag inconsistencies across all connected platforms.</p>
        </CardFooter>
      </form>
    </Card>
  );
}
