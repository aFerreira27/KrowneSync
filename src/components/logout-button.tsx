
'use client';

import { signOut } from 'firebase/auth';
import { useAuth } from '@/components/firebase-provider';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import React from 'react';
import { useToast } from '@/hooks/use-toast';

function LogoutButton() {
  const router = useRouter();
  const { auth } = useAuth();
  const { toast } = useToast();

  const handleLogout = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
      router.push('/');
    } catch (error) {
      console.error("Error signing out:", error);
      toast({
        variant: "destructive",
        title: "Logout Failed",
        description: "There was an error signing you out. Please try again."
      });
    }
  };

  return (
    <Button variant="ghost" onClick={handleLogout} className="w-full justify-start p-2">
      <LogOut className="mr-2 h-4 w-4" />
      Logout
    </Button>
  );
}

export default LogoutButton;
