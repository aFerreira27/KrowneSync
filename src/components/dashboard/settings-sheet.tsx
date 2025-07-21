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
import { Database, Globe, ShoppingCart, Presentation } from 'lucide-react';
import { useState, ChangeEvent } from 'react';
import { useToast } from '@/hooks/use-toast';

type Platform = {
  name: string;
  icon: JSX.Element;
  token: string;
  connected: boolean;
};

const initialPlatforms: Platform[] = [
  { name: 'Salesforce', icon: <Database className="h-6 w-6 text-blue-500" />, token: '', connected: false },
  { name: 'Salespad', icon: <ShoppingCart className="h-6 w-6 text-red-500" />, token: '', connected: false },
  { name: 'Autoquotes', icon: <Presentation className="h-6 w-6 text-yellow-500" />, token: '', connected: false },
  { name: 'Website CMS', icon: <Globe className="h-6 w-6 text-green-500" />, token: '', connected: false },
];

type SettingsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SettingsSheet({ open, onOpenChange }: SettingsSheetProps) {
  const [platforms, setPlatforms] = useState<Platform[]>(initialPlatforms);
  const { toast } = useToast();

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
        setPlatforms(prevPlatforms =>
            prevPlatforms.map(p =>
                p.name === platformName ? { ...p, connected: isConnecting } : p
            )
        );
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
          <SheetTitle className="font-headline text-2xl">Settings</SheetTitle>
          <SheetDescription>
            Manage authentication tokens for your connected platforms.
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
                        ? 'mt-1 w-fit bg-green-100 text-green-800 border-green-200' 
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
