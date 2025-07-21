import { DataSyncCard } from '@/components/dashboard/data-sync-card';
import { ConnectedPlatforms } from '@/components/dashboard/connected-platforms';
import { PdfActions } from '@/components/dashboard/pdf-actions';
import { Separator } from '@/components/ui/separator';

export default function DashboardPage() {
  // All dashboard content is now rendered by the layout.
  // This page component is a placeholder.
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-headline text-3xl font-bold tracking-tight">
          Welcome back!
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
