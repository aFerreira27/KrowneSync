
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
import { Home, Link as LinkIcon, LifeBuoy, ShieldCheck, Loader2, User as UserIcon, Database, ShoppingCart, Presentation, Globe, LayoutTemplate, FileText, SearchCode } from "lucide-react";
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, User, updateProfile } from 'firebase/auth';
import { useRouter, usePathname } from 'next/navigation';
import { ConnectionsSheet } from '@/components/dashboard/connections-sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import LogoutButton from '@/components/logout-button';
import { SupportDialog } from '@/components/dashboard/support-dialog';
import { ProfileDialog } from '@/components/dashboard/profile-dialog';
import { DataSyncCard } from '@/components/dashboard/data-sync-card';
import { Separator } from '@/components/ui/separator';
import { ConnectedPlatforms } from '@/components/dashboard/connected-platforms';
import Link from 'next/link';

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
  { name: 'Web Scrapper', icon: <SearchCode className="h-6 w-6 text-purple-500" />, token: '', connected: true }, // Web scrapper is always "connected"
];

type UserData = {
  name: string;
  email: string;
  initials: string;
  photoURL: string;
};


export function DashboardClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isConnectionsOpen, setIsConnectionsOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [platforms, setPlatforms] = useState<Platform[]>(initialPlatforms);

  const handlePlatformUpdate = useCallback((updatedPlatforms: Platform[]) => {
    setPlatforms(updatedPlatforms);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setUserData({
          name: currentUser.displayName || 'User',
          email: currentUser.email || '',
          initials: currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : 'U',
          photoURL: currentUser.photoURL || `https://placehold.co/40x40.png`
        });
        setLoading(false);
      } else {
        router.push('/');
      }
    });

    return () => unsubscribe();
  }, [router]);

  const onConnectClick = useCallback(() => {
    setIsConnectionsOpen(true);
  }, []);

  if (loading || !user || !userData) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  const isDashboardPage = pathname === '/dashboard';

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <Logo textClassName="text-foreground" showText={false}/>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <Link href="/dashboard" passHref>
                <SidebarMenuButton asChild isActive={pathname === '/dashboard'}>
                  <span>
                    <Home />
                    Dashboard
                  </span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
            <SidebarMenuItem>
               <Link href="/dashboard/sync-status" passHref>
                <SidebarMenuButton asChild isActive={pathname === '/dashboard/sync-status'}>
                  <span>
                    <ShieldCheck />
                    Sync Status
                  </span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <Link href="/dashboard/template-maker" passHref>
                <SidebarMenuButton asChild isActive={pathname === '/dashboard/template-maker'}>
                  <span>
                    <LayoutTemplate />
                    Template Maker
                  </span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <Link href="/dashboard/pdf-generator" passHref>
                <SidebarMenuButton asChild isActive={pathname === '/dashboard/pdf-generator'}>
                  <span>
                    <FileText />
                    PDF Generator
                  </span>
                </SidebarMenuButton>
              </Link>
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
                    <DropdownMenuItem onClick={() => setIsProfileOpen(true)}>
                      <UserIcon className="mr-2 h-4 w-4" />
                      <span>Profile</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setIsConnectionsOpen(true)}>
                      <LinkIcon className="mr-2 h-4 w-4" />
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
          {isDashboardPage && (
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
                  <DataSyncCard platforms={platforms} />
                </div>
                <div className="flex flex-col gap-6">
                  <ConnectedPlatforms platforms={platforms} onConnectClick={onConnectClick}/>
                </div>
              </div>
            </div>
          )}
          {!isDashboardPage && children}
        </main>
      </SidebarInset>
      <ConnectionsSheet 
        open={isConnectionsOpen} 
        onOpenChange={setIsConnectionsOpen} 
        platforms={platforms}
        onPlatformUpdate={handlePlatformUpdate}
      />
      <SupportDialog open={isSupportOpen} onOpenChange={setIsSupportOpen} />
      <ProfileDialog user={user} open={isProfileOpen} onOpenChange={setIsProfileOpen} />
    </SidebarProvider>
  );
}
