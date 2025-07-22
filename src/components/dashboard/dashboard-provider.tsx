
'use client';

import React, { createContext, useState, useCallback, ReactNode } from 'react';
import { Database, ShoppingCart, Presentation, Globe, SearchCode } from "lucide-react";

export type Platform = {
  name: string;
  icon: JSX.Element;
  token: string;
  connected: boolean;
};

export type SyncRecord = {
    sku: string;
    syncedAt: string;
    status: 'Synced' | 'Out of Sync';
};

type DashboardContextType = {
  platforms: Platform[];
  onPlatformUpdate: (platforms: Platform[]) => void;
  isConnectionsOpen: boolean;
  setIsConnectionsOpen: (open: boolean) => void;
  focusedPlatform: string | null;
  onConnectClick: (platformName: string) => void;
  onClearFocus: () => void;
};

export const DashboardContext = createContext<DashboardContextType | null>(null);

const initialPlatforms: Platform[] = [
  { name: 'Salesforce', icon: <Database className="h-6 w-6 text-blue-500" />, token: '', connected: false },
  { name: 'Salespad', icon: <ShoppingCart className="h-6 w-6 text-red-500" />, token: '', connected: false },
  { name: 'Autoquotes', icon: <Presentation className="h-6 w-6 text-yellow-500" />, token: '', connected: false },
  { name: 'Website CMS', icon: <Globe className="h-6 w-6 text-green-500" />, token: '', connected: false },
  { name: 'Web Scrapper', icon: <SearchCode className="h-6 w-6 text-purple-500" />, token: '', connected: true }, // Web scrapper is always "connected"
];

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [platforms, setPlatforms] = useState<Platform[]>(initialPlatforms);
  const [isConnectionsOpen, setIsConnectionsOpen] = useState(false);
  const [focusedPlatform, setFocusedPlatform] = useState<string | null>(null);

  const onConnectClick = useCallback((platformName: string) => {
    setFocusedPlatform(platformName);
    setIsConnectionsOpen(true);
  }, []);

  const onClearFocus = useCallback(() => {
    setFocusedPlatform(null);
  }, []);

  const value = {
    platforms,
    onPlatformUpdate: setPlatforms,
    isConnectionsOpen,
    setIsConnectionsOpen,
    focusedPlatform,
    onConnectClick,
    onClearFocus,
  };

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}
