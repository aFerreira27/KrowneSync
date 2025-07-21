import { getUser } from "@/lib/actions";
import { ConnectedPlatforms } from "@/components/dashboard/connected-platforms";
import { DataSyncCard } from "@/components/dashboard/data-sync-card";
import { PdfActions } from "@/components/dashboard/pdf-actions";
import { Separator } from "@/components/ui/separator";

export default async function DashboardPage() {
  const user = await getUser();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-headline text-3xl font-bold tracking-tight">
          Welcome back, {user?.name?.split(' ')[0]}!
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
