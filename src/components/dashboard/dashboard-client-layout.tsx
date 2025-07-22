
'use client';

import React, { useState, useEffect, useContext } from 'react';
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
import { Home, Link as LinkIcon, LifeBuoy, ShieldCheck, Loader2, User as UserIcon } from "lucide-react";
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { useRouter, usePathname } from 'next/navigation';
import { ConnectionsSheet } from '@/components/dashboard/connections-sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import LogoutButton from '@/components/logout-button';
import { SupportDialog } from '@/components/dashboard/support-dialog';
import { ProfileDialog } from '@/components/dashboard/profile-dialog';
import Link from 'next/link';
import { DashboardContext } from '@/components/dashboard/dashboard-provider';

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
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('DashboardClientLayout must be used within a DashboardProvider');
  }
  const { 
    platforms, 
    onPlatformUpdate, 
    isConnectionsOpen, 
    setIsConnectionsOpen, 
    focusedPlatform, 
    onClearFocus 
  } = context;

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


  if (loading || !user || !userData) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
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
          {children}
        </main>
      </SidebarInset>
      <ConnectionsSheet 
        open={isConnectionsOpen} 
        onOpenChange={setIsConnectionsOpen} 
        platforms={platforms}
        onPlatformUpdate={onPlatformUpdate}
        focusedPlatform={focusedPlatform}
        onClearFocus={onClearFocus}
      />
      <SupportDialog open={isSupportOpen} onOpenChange={setIsSupportOpen} />
      <ProfileDialog user={user} open={isProfileOpen} onOpenChange={setIsProfileOpen} />
    </SidebarProvider>
  );
}
