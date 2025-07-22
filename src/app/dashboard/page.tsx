
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format, formatDistanceToNow } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { DataSyncCard } from '@/components/dashboard/data-sync-card';
import type { Platform } from '@/components/dashboard/dashboard-client-layout';
import { ConnectedPlatforms } from '@/components/dashboard/connected-platforms';

export type SyncRecord = {
    sku: string;
    syncedAt: string;
    status: 'Synced' | 'Out of Sync';
};

type DashboardPageProps = {
    platforms: Platform[];
    onPlatformUpdate: (platforms: Platform[]) => void;
    onConnectClick: (platformName: string) => void;
}

export default function DashboardPage({ platforms, onPlatformUpdate, onConnectClick }: DashboardPageProps) {
    const [syncHistory, setSyncHistory] = useState<SyncRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        try {
            const storedHistoryJson = localStorage.getItem('syncHistory');
            if (storedHistoryJson) {
                const storedHistory = JSON.parse(storedHistoryJson);
                if (Array.isArray(storedHistory)) {
                    setSyncHistory(storedHistory);
                }
            }
        } catch (error) {
            console.error("Failed to parse sync history from localStorage", error);
            localStorage.removeItem('syncHistory'); // Clear corrupted data
        }
        setIsLoading(false);
    }, []);

    const updateSyncHistory = (newRecords: SyncRecord[]) => {
        setSyncHistory(prevHistory => {
            const historyMap = new Map(prevHistory.map(r => [r.sku, r]));
            newRecords.forEach(record => {
                historyMap.set(record.sku, record);
            });
            const newHistory = Array.from(historyMap.values())
                .sort((a, b) => new Date(b.syncedAt).getTime() - new Date(a.syncedAt).getTime());
            
            try {
                localStorage.setItem('syncHistory', JSON.stringify(newHistory));
            } catch (error) {
                console.error("Failed to save sync history to localStorage", error);
            }
            
            return newHistory;
        });
    };

    return (
        <div className="flex flex-col gap-8">
             <div>
                <h1 className="font-headline text-3xl font-bold tracking-tight">Data Synchronization</h1>
                <p className="text-muted-foreground">
                  Fetch product data, view synchronization status, and manage platform connections.
                </p>
              </div>

            <DataSyncCard platforms={platforms} onSyncComplete={updateSyncHistory} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Product Sync History</CardTitle>
                        <CardDescription>
                            View the sync status and history for each product SKU.
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
                                                    No sync history found. Fetch product data to begin.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                    </CardContent>
                </Card>
                <ConnectedPlatforms platforms={platforms} onConnectClick={onConnectClick} />
            </div>
        </div>
    );
}
