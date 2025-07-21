'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Logo from "@/components/logo";
import { Home, Link, LifeBuoy, BarChart3, Loader2, User as UserIcon, Database, ShoppingCart, Presentation, Globe } from "lucide-react";
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { ConnectionsSheet } from '@/components/dashboard/connections-sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import LogoutButton from '@/components/logout-button';
import { SupportDialog } from '@/components/dashboard/support-dialog';

export type Platform = {
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

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isConnectionsOpen, setIsConnectionsOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [platforms, setPlatforms] = useState<Platform[]>(initialPlatforms);

  const handlePlatformUpdate = useCallback((updatedPlatforms: Platform[]) => {
    setPlatforms(updatedPlatforms);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setLoading(false);
      } else {
        router.push('/');
      }
    });

    return () => unsubscribe();
  }, [router]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  if (!user) {
    return null;
  }

  const userData = {
    name: user.displayName || 'User',
    email: user.email || '',
    initials: user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U',
    photoURL: user.photoURL || `https://placehold.co/40x40.png`
  };

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <Logo textClassName="text-foreground" showText={false}/>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton href="/dashboard" isActive>
                <Home />
                Dashboard
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton href="#">
                <BarChart3 />
                Analytics
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex w-full items-center gap-3 rounded-md px-2 py-1 text-left transition-colors hover:bg-sidebar-accent">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={userData.photoURL} alt={userData.name} />
                      <AvatarFallback>{userData.initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold">{userData.name}</span>
                      <span className="text-xs text-muted-foreground">{userData.email}</span>
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56 mb-2" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{userData.name}</p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {userData.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem>
                      <UserIcon className="mr-2 h-4 w-4" />
                      <span>Profile</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setIsConnectionsOpen(true)}>
                      <Link className="mr-2 h-4 w-4" />
                      <span>Connections</span>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                   <DropdownMenuItem onClick={() => setIsSupportOpen(true)}>
                      <LifeBuoy className="mr-2 h-4 w-4" />
                      <span>Support</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <LogoutButton />
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <main className="flex-1 overflow-auto p-4 md:p-8">
          {React.cloneElement(children as React.ReactElement, { platforms })}
        </main>
      </SidebarInset>
      <ConnectionsSheet 
        open={isConnectionsOpen} 
        onOpenChange={setIsConnectionsOpen} 
        platforms={platforms}
        onPlatformUpdate={handlePlatformUpdate}
      />
      <SupportDialog open={isSupportOpen} onOpenChange={setIsSupportOpen} />
    </SidebarProvider>
  );
}
