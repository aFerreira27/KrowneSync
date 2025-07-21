'use client';

import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import { User } from 'firebase/auth';
import { ConnectedPlatforms } from "@/components/dashboard/connected-platforms";
import { DataSyncCard } from "@/components/dashboard/data-sync-card";
import { PdfActions } from "@/components/dashboard/pdf-actions";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-8">
        <div>
          <Skeleton className="h-9 w-64" />
          <Skeleton className="mt-2 h-5 w-80" />
        </div>
        <Separator />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Skeleton className="h-[400px] w-full" />
          </div>
          <div className="flex flex-col gap-6">
            <Skeleton className="h-[200px] w-full" />
            <Skeleton className="h-[200px] w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-headline text-3xl font-bold tracking-tight">
          Welcome back, {user?.displayName?.split(' ')[0]}!
        </h1>
        <p className="text-muted-foreground">
          Here's your data synchronization overview.
        </p>
      </div>
      <Separator />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
           <DataSyncCard />
        </div>
        <div className="flex flex-col gap-6">
          <ConnectedPlatforms />
          <PdfActions />
        </div>
      </div>
    </div>
  );
}
