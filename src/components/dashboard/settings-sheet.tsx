'use client';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Database, Globe, ShoppingCart, Presentation } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

const initialPlatforms = [
  { name: 'Salesforce', icon: <Database className="h-6 w-6 text-blue-500" />, connected: true },
  { name: 'Salespad', icon: <ShoppingCart className="h-6 w-6 text-red-500" />, connected: true },
  { name: 'Autoquotes', icon: <Presentation className="h-6 w-6 text-yellow-500" />, connected: true },
  { name: 'Website CMS', icon: <Globe className="h-6 w-6 text-green-500" />, connected: true },
];

type SettingsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SettingsSheet({ open, onOpenChange }: SettingsSheetProps) {
  const [platforms, setPlatforms] = useState(initialPlatforms);
  const { toast } = useToast();

  const handleConnectionChange = (platformName: string, connected: boolean) => {
    setPlatforms(prevPlatforms =>
      prevPlatforms.map(p =>
        p.name === platformName ? { ...p, connected } : p
      )
    );
    toast({
      title: `${platformName} ${connected ? 'Connected' : 'Disconnected'}`,
      description: `Successfully updated ${platformName} connection.`,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full max-w-md">
        <SheetHeader>
          <SheetTitle className="font-headline text-2xl">Settings</SheetTitle>
          <SheetDescription>
            Manage your connected platforms and other application settings.
          </SheetDescription>
        </SheetHeader>
        <Separator className="my-6" />
        <div className="space-y-6">
          <h3 className="font-headline text-lg font-semibold">
            Manage Connections
          </h3>
          <ul className="space-y-4">
            {platforms.map(platform => (
              <li
                key={platform.name}
                className="flex items-center justify-between rounded-lg border p-4 shadow-sm"
              >
                <div className="flex items-center gap-4">
                  {platform.icon}
                  <Label htmlFor={`${platform.name}-switch`} className="text-base font-medium">
                    {platform.name}
                  </Label>
                </div>
                <Switch
                  id={`${platform.name}-switch`}
                  checked={platform.connected}
                  onCheckedChange={(checked) => handleConnectionChange(platform.name, checked)}
                  aria-label={`Connect or disconnect ${platform.name}`}
                />
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}
