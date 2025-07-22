
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format, formatDistanceToNow } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

type SyncRecord = {
    sku: string;
    syncedAt: string;
    status: 'Synced' | 'Out of Sync';
};

export default function SyncStatusPage() {
    const [syncHistory, setSyncHistory] = useState<SyncRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // In a real app, this data would be fetched from a database.
        // For this example, we'll read it from localStorage.
        const storedHistoryJson = localStorage.getItem('syncHistory');
        if (storedHistoryJson) {
            const storedHistory = JSON.parse(storedHistoryJson);
             // Add a mock "Out of Sync" product for demonstration
            if (!storedHistory.some((r: SyncRecord) => r.sku === 'SKU-ABCDE')) {
                const oneWeekAgo = new Date();
                oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
                storedHistory.push({
                    sku: 'SKU-ABCDE',
                    syncedAt: oneWeekAgo.toISOString(),
                    status: 'Out of Sync'
                });
            }
            setSyncHistory(storedHistory);
        } else {
             // Create mock data if nothing is in local storage
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            const mockHistory = [{
                sku: 'SKU-ABCDE',
                syncedAt: oneWeekAgo.toISOString(),
                status: 'Out of Sync'
            }];
            setSyncHistory(mockHistory);
            localStorage.setItem('syncHistory', JSON.stringify(mockHistory));
        }

        setIsLoading(false);
    }, []);

    return (
        <div className="flex flex-col gap-8">
             <div>
                <h1 className="font-headline text-3xl font-bold tracking-tight">Sync Status</h1>
                <p className="text-muted-foreground">
                  View the last synchronization time for all your products.
                </p>
              </div>

            <Card>
                <CardHeader>
                    <CardTitle>Product Sync Overview</CardTitle>
                    <CardDescription>
                        This table shows the synchronization status of all products that have been checked.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[200px]">Product SKU</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Last Synced</TableHead>
                                    <TableHead className="text-right">Last Synced Date</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                            <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-4 w-40" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : syncHistory.length > 0 ? (
                                    syncHistory.map((record) => (
                                        <TableRow key={record.sku}>
                                            <TableCell className="font-medium">{record.sku}</TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant={record.status === 'Synced' ? 'default' : 'destructive'}
                                                    className={record.status === 'Synced' ? 'bg-green-600 hover:bg-green-700' : ''}
                                                >
                                                    {record.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {formatDistanceToNow(new Date(record.syncedAt), { addSuffix: true })}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {format(new Date(record.syncedAt), 'PPP p')}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-24 text-center">
                                            No sync history found. Fetch product data on the dashboard to begin.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
