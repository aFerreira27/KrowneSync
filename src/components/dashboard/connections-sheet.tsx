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
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState, ChangeEvent, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { Platform } from '@/app/dashboard/layout';

type ConnectionsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platforms: Platform[];
  onPlatformUpdate: (platforms: Platform[]) => void;
};

export function ConnectionsSheet({ open, onOpenChange, platforms: initialPlatforms, onPlatformUpdate }: ConnectionsSheetProps) {
  const [platforms, setPlatforms] = useState<Platform[]>(initialPlatforms);
  const { toast } = useToast();

  useEffect(() => {
    setPlatforms(initialPlatforms);
  }, [initialPlatforms]);

  const handleTokenChange = (platformName: string, value: string) => {
    setPlatforms(prevPlatforms =>
      prevPlatforms.map(p =>
        p.name === platformName ? { ...p, token: value } : p
      )
    );
  };
  
  const handleSaveToken = (platformName: string) => {
    const platform = platforms.find(p => p.name === platformName);
    if (platform) {
        const isConnecting = platform.token.trim() !== '';
        const updatedPlatforms = platforms.map(p =>
            p.name === platformName ? { ...p, connected: isConnecting } : p
        );
        setPlatforms(updatedPlatforms);
        onPlatformUpdate(updatedPlatforms); // Lift the state up
        toast({
            title: `${platformName} ${isConnecting ? 'Connected' : 'Disconnected'}`,
            description: `Authentication token for ${platformName} has been ${isConnecting ? 'saved' : 'cleared'}.`,
        });
    }
  };


  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full max-w-lg sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="font-headline text-2xl">Connections</SheetTitle>
          <SheetDescription>
            Manage API keys and authentication tokens for your connected platforms.
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
                className="flex flex-col gap-4 rounded-lg border p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-4">
                  {platform.icon}
                  <div className="flex flex-col">
                    <Label htmlFor={`${platform.name}-token`} className="text-base font-medium">
                      {platform.name}
                    </Label>
                     <Badge 
                      variant={platform.connected ? 'secondary' : 'outline'} 
                      className={platform.connected 
                        ? 'mt-1 w-fit bg-green-100/50 text-green-800 dark:text-green-200 border-green-200/50' 
                        : 'mt-1 w-fit'}
                    >
                      {platform.connected ? 'Connected' : 'Disconnected'}
                    </Badge>
                  </div>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                    <Input 
                        id={`${platform.name}-token`}
                        type="password"
                        placeholder="Enter API Key / Token"
                        value={platform.token}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => handleTokenChange(platform.name, e.target.value)}
                        className="sm:min-w-64"
                    />
                    <Button onClick={() => handleSaveToken(platform.name)}>
                        {platform.connected ? 'Update' : 'Save'}
                    </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}