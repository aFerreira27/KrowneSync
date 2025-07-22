
'use client';

import { DashboardClientLayout } from '@/components/dashboard/dashboard-client-layout';
import React, { useState } from 'react';
import type { Platform } from '@/components/dashboard/dashboard-client-layout';
import { Database, ShoppingCart, Presentation, Globe, SearchCode } from "lucide-react";


const initialPlatforms: Platform[] = [
  { name: 'Salesforce', icon: <Database className="h-6 w-6 text-blue-500" />, token: '', connected: false },
  { name: 'Salespad', icon: <ShoppingCart className="h-6 w-6 text-red-500" />, token: '', connected: false },
  { name: 'Autoquotes', icon: <Presentation className="h-6 w-6 text-yellow-500" />, token: '', connected: false },
  { name: 'Website CMS', icon: <Globe className="h-6 w-6 text-green-500" />, token: '', connected: false },
  { name: 'Web Scrapper', icon: <SearchCode className="h-6 w-6 text-purple-500" />, token: '', connected: true }, // Web scrapper is always "connected"
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [platforms, setPlatforms] = useState<Platform[]>(initialPlatforms);
  
  // To avoid the `params` enumeration error, we pass props directly to the
  // client layout and let Next.js handle rendering the children.
  // The pages will receive their props from the client layout.
  const childrenWithProps = React.Children.map(children, child => {
    if (React.isValidElement(child)) {
      // @ts-ignore
      return React.cloneElement(child, { platforms, onPlatformUpdate: setPlatforms });
    }
    return child;
  });

  return (
      <DashboardClientLayout platforms={platforms} onPlatformUpdate={setPlatforms}>
        {childrenWithProps}
      </DashboardClientLayout>
  );
}
