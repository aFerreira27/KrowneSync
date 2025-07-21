'use client';

import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import { User } from 'firebase/auth';
import { ConnectedPlatforms } from "@/components/dashboard/connected-platforms";
import { PdfActions } from "@/components/dashboard/pdf-actions";
import { Skeleton } from '@/components/ui/skeleton';
import type { Platform } from './layout';

export default function DashboardPage({ platforms }: { platforms: Platform[] }) {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  if (!platforms || !user) {
    return (
      <>
        <Skeleton className="h-[200px] w-full" />
        <Skeleton className="h-[200px] w-full" />
      </>
    );
  }

  return (
    <>
      <ConnectedPlatforms platforms={platforms} />
      <PdfActions />
    </>
  );
}
