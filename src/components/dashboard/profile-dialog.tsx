
'use client';

import { User } from 'firebase/auth';
import React, { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { auth, updateProfile } from '@/lib/firebase';
import { Loader2, UploadCloud } from 'lucide-react';

type ProfileDialogProps = {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ProfileDialog({ user, open, onOpenChange }: ProfileDialogProps) {
  const { toast } = useToast();
  const [newPhoto, setNewPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setNewPhoto(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const resizeImage = (file: File, width: number, height: number): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    return reject(new Error('Could not get canvas context'));
                }
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL(file.type));
            };
        };
        reader.onerror = (error) => reject(error);
    });
  };

  const handleSave = async () => {
    if (!auth.currentUser || !newPhoto) return;

    setIsSaving(true);
    try {
        const resizedDataUrl = await resizeImage(newPhoto, 128, 128); // Resize to a higher quality for display flexibility
        await updateProfile(auth.currentUser, {
            photoURL: resizedDataUrl,
        });

        toast({
            title: 'Profile Updated',
            description: 'Your profile picture has been successfully updated.',
        });
        onOpenChange(false);
        setNewPhoto(null);
        setPreviewUrl(null);
    } catch (error) {
        console.error("Error updating profile:", error);
        toast({
            variant: 'destructive',
            title: 'Update Failed',
            description: 'There was an error updating your profile picture.',
        });
    } finally {
        setIsSaving(false);
    }
  };
  
  const currentPhotoURL = previewUrl || user?.photoURL || `https://placehold.co/128x128.png`;
  const currentInitials = user?.displayName ? user.displayName.charAt(0).toUpperCase() : 'U';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-headline text-2xl">Your Profile</DialogTitle>
          <DialogDescription>
            View your profile information and update your picture.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
            <div className="flex items-center gap-4">
                <Avatar className="h-24 w-24">
                    <AvatarImage src={currentPhotoURL} alt={user?.displayName || 'User'} />
                    <AvatarFallback className="text-4xl">{currentInitials}</AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                    <p className="text-xl font-semibold">{user?.displayName}</p>
                    <p className="text-muted-foreground">{user?.email}</p>
                </div>
            </div>
             <div className="space-y-2">
                <Label htmlFor="picture">Profile Picture</Label>
                <div className="flex items-center gap-2">
                    <Input id="picture" type="file" accept="image/*" onChange={handleFileChange} ref={fileInputRef} className="hidden" />
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                        <UploadCloud className="mr-2" />
                        Choose Image
                    </Button>
                    {newPhoto && <span className="text-sm text-muted-foreground truncate">{newPhoto.name}</span>}
                </div>
            </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving || !newPhoto}>
            {isSaving ? <Loader2 className="mr-2 animate-spin" /> : null}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
