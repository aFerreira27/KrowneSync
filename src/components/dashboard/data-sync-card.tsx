
'use client';

import { useActionState, useRef, useState, useEffect } from 'react';
import { useFormStatus } from 'react-dom';
import { getSyncData, generateSpecSheetPdfAction, getBulkSyncData, type ActionState, type ProductData, type BulkActionState, type SyncRecord } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, BadgeCheck, FileWarning, Loader2, Search, Info, FileDown, Rocket } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Discrepancy } from '@/lib/actions';
import { Combobox, ComboboxOption } from '@/components/ui/combobox';
import type { Platform } from '@/components/dashboard/dashboard-provider';
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

function SyncAllButton({ skus, onSyncAll, disabled }: { skus: string[], onSyncAll: (e: React.MouseEvent<HTMLButtonElement>) => void, disabled: boolean }) {
    const { pending } = useFormStatus();

    return (
         <Button 
            onClick={onSyncAll} 
            disabled={pending || skus.length === 0 || disabled} 
            className="w-full sm:w-auto" 
            variant="outline"
        >
             {pending ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Syncing All...
                </>
            ) : (
                <>
                    <Rocket className="mr-2 h-4 w-4" />
                    Sync All SKUs ({skus.length})
                </>
            )}
        </Button>
    )
}


function GeneratePdfButton({ productData }: { productData: ProductData }) {
    const [isGenerating, setIsGenerating] = useState(false);
    const { toast } = useToast();

    const handleGeneratePdf = async () => {
        setIsGenerating(true);
        try {
            const formData = new FormData();
            formData.append('productData', JSON.stringify(productData));
            const result = await generateSpecSheetPdfAction(null, formData);

            if (result.error) {
                throw new Error(result.error);
            }
            
            if (result.pdfBase64 && result.fileName) {
                 // Create a link and click it to trigger the download
                const link = document.createElement('a');
                link.href = `data:application/pdf;base64,${result.pdfBase64}`;
                link.download = result.fileName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                 toast({
                    title: "PDF Generated",
                    description: `${result.fileName} has started downloading.`,
                });
            }

        } catch (e: any) {
             toast({
                variant: "destructive",
                title: "PDF Generation Failed",
                description: e.message || "An unexpected error occurred.",
            });
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <Button onClick={handleGeneratePdf} disabled={isGenerating} variant="secondary">
            {isGenerating ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                </>
            ) : (
                <>
                    <FileDown className="mr-2 h-4 w-4" />
                    Generate Spec Sheet PDF
                </>
            )}
        </Button>
    )
}

const SKU_HISTORY_KEY = 'skuHistory';
const SEARCH_HISTORY_KEY = 'productSearchHistory';

const initialActionState: ActionState = {
  productData: undefined,
  discrepancies: [],
  summary: '',
  error: null,
};

const initialBulkActionState: BulkActionState = {
    results: [],
    error: null,
};


export function DataSyncCard({ platforms = [], onSyncComplete }: { platforms: Platform[], onSyncComplete: (records: SyncRecord[]) => void }) {
  const [singleSyncState, singleSyncFormAction] = useActionState(getSyncData, initialActionState);
  const [bulkSyncState, bulkSyncFormAction] = useActionState(getBulkSyncData, initialBulkActionState);
  
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [productIdentifier, setProductIdentifier] = useState('');
  
  const [searchHistory, setSearchHistory] = useState<ComboboxOption[]>([]);
  const [skuHistory, setSkuHistory] = useState<string[]>([]);
  const [isSyncingAll, setIsSyncingAll] = useState(false);

  const atLeastOnePlatformConnected = platforms.some(p => p.connected);

  useEffect(() => {
    try {
        const storedSearchHistory = localStorage.getItem(SEARCH_HISTORY_KEY);
        if (storedSearchHistory) setSearchHistory(JSON.parse(storedSearchHistory));

        const storedSkuHistory = localStorage.getItem(SKU_HISTORY_KEY);
        if (storedSkuHistory) setSkuHistory(JSON.parse(storedSkuHistory));
    } catch (e) {
        console.error("Failed to parse history from localStorage", e);
    }
  }, []);

  const updateHistories = (sku: string) => {
    // Update search history (for combobox)
    const newSearchHistory = [...searchHistory];
    if (!newSearchHistory.find(item => item.value === sku.toLowerCase())) {
        newSearchHistory.unshift({ value: sku.toLowerCase(), label: sku });
    }
    const updatedSearchHistory = newSearchHistory.slice(0, 10);
    setSearchHistory(updatedSearchHistory);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(updatedSearchHistory));

    // Update SKU history (for "Sync All")
    if (!skuHistory.includes(sku)) {
        const updatedSkuHistory = [...skuHistory, sku];
        setSkuHistory(updatedSkuHistory);
        localStorage.setItem(SKU_HISTORY_KEY, JSON.stringify(updatedSkuHistory));
    }
  };

  useEffect(() => {
    const state = singleSyncState; // Process single sync results
    if (state?.error) {
      const errorMessage =
        typeof state.error === 'string'
          ? state.error
          : (state.error && typeof state.error === 'object' && Object.values(state.error).length > 0)
          ? Object.values(state.error).flat().join(' ')
          : 'An unexpected error occurred.';

      toast({
          variant: "destructive",
          title: "Error",
          description: errorMessage,
      });
    } else if (state?.productData && state?.syncedAt) {
      if(productIdentifier) {
        updateHistories(productIdentifier);
      }

      const syncStatus: 'Synced' | 'Out of Sync' = state.discrepancies && state.discrepancies.length > 0 ? 'Out of Sync' : 'Synced';
      const syncRecord: SyncRecord = { sku: productIdentifier, syncedAt: state.syncedAt, status: syncStatus };
      onSyncComplete([syncRecord]);
    }
  }, [singleSyncState]);

   useEffect(() => {
    const state = bulkSyncState; // Process bulk sync results
    setIsSyncingAll(false);

    if (state?.error) {
      toast({
          variant: "destructive",
          title: "Bulk Sync Error",
          description: state.error,
      });
    }
    
    if (state?.results && state.results.length > 0) {
        onSyncComplete(state.results);
        toast({
            title: "Bulk Sync Complete",
            description: `Successfully processed ${state.results.length} SKUs.`
        });
    }
  }, [bulkSyncState]);

  const handleSyncAll = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (skuHistory.length === 0) return;
    setIsSyncingAll(true);

    const formData = new FormData();
    formData.append('skus', JSON.stringify(skuHistory));
    const platformConnections = platforms.reduce((acc, p) => {
        acc[p.name.toLowerCase().replace(/\s/g, '')] = p.connected;
        return acc;
    }, {} as Record<string, boolean>);
    formData.append('platformConnections', JSON.stringify(platformConnections));
    bulkSyncFormAction(formData);
  };

  const platformConnections = platforms.reduce((acc, p) => {
    acc[p.name.toLowerCase().replace(/\s/g, '')] = p.connected;
    return acc;
  }, {} as Record<string, boolean>);


  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardDescription>
          Enter a product SKU to fetch its data from all connected platforms and identify discrepancies. Or, sync all previously entered SKUs.
        </CardDescription>
      </CardHeader>
      <form ref={formRef} action={singleSyncFormAction}>
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
              <input type="hidden" name="platformConnections" value={JSON.stringify(platformConnections)} />
            </div>
            <SubmitButton atLeastOnePlatformConnected={atLeastOnePlatformConnected} />
            <SyncAllButton skus={skuHistory} onSyncAll={handleSyncAll} disabled={!atLeastOnePlatformConnected || isSyncingAll}/>
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

          {singleSyncState?.productData && (
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="flex-grow">
                             <h2 className="text-2xl font-bold font-headline">{singleSyncState.productData.name}</h2>
                             <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                                <span>SKU: {singleSyncState.productData.sku}</span>
                                {singleSyncState.productData.series && (
                                    <>
                                        <Separator orientation="vertical" className="h-4" />
                                        <span>Series: {singleSyncState.productData.series}</span>
                                    </>
                                )}
                             </div>
                        </div>
                        <GeneratePdfButton productData={singleSyncState.productData} />
                    </div>
                </CardHeader>
                <CardContent className="p-6 pt-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                           <Carousel className="w-full">
                                <CarouselContent>
                                    {singleSyncState.productData.images && singleSyncState.productData.images.length > 0 ? (
                                        singleSyncState.productData.images.map((img, index) => (
                                            <CarouselItem key={index}>
                                                <Image 
                                                    src={img} 
                                                    alt={`${singleSyncState.productData?.name} image ${index + 1}`}
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
                             <p className="mt-4 text-sm">{singleSyncState.productData.description}</p>
                        </div>
                    </div>
                    <Separator className="my-6" />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <h3 className="font-headline font-semibold mb-3">Standard Features</h3>
                            <ul className="list-disc list-inside space-y-1 text-sm">
                                {singleSyncState.productData.standardFeatures?.map(feature => <li key={feature}>{feature}</li>)}
                            </ul>
                        </div>
                        <div>
                            <h3 className="font-headline font-semibold mb-3">Compliances</h3>
                            <ul className="list-disc list-inside space-y-1 text-sm">
                                {singleSyncState.productData.compliances?.map(item => <li key={item}>{item}</li>)}
                            </ul>
                        </div>
                    </div>

                    <Separator className="my-6" />

                    <div>
                        <h3 className="font-headline font-semibold mb-3">Specifications</h3>
                        <div className="rounded-md border">
                            <Table>
                                <TableBody>
                                    {singleSyncState.productData.specifications?.map(spec => (
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
                        {singleSyncState.discrepancies && singleSyncState.discrepancies.length > 0 ? (
                            <>
                                <Alert>
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle className="font-headline">AI Analysis Complete</AlertTitle>
                                    <AlertDescription>{singleSyncState.summary}</AlertDescription>
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
                                            {singleSyncState.discrepancies.map((d, index) => (
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
