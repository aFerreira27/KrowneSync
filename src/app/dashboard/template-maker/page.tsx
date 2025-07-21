
'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Designer } from '@pdfme/ui';
import { Template, BLANK_PDF } from '@pdfme/common';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save } from 'lucide-react';

const template: Template = {
  basePdf: BLANK_PDF,
  schemas: [
    {
      a: {
        type: 'text',
        position: { x: 0, y: 0 },
        width: 10,
        height: 10,
      },
      b: {
        type: 'text',
        position: { x: 10, y: 10 },
        width: 10,
        height: 10,
      },
      c: {
        type: 'text',
        position: { x: 20, y: 20 },
        width: 10,
        height: 10,
      },
    },
  ],
};

export default function TemplateMakerPage() {
  const designerRef = useRef<HTMLDivElement | null>(null);
  const designer = useRef<Designer | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (designerRef.current) {
      designer.current = new Designer({
        domContainer: designerRef.current,
        template,
      });
    }
    return () => {
      if (designer.current) {
        designer.current.destroy();
      }
    };
  }, []);
  
  const onSaveTemplate = () => {
    if (!designer.current) return;
    setIsSaving(true);
    try {
      const templateJson = designer.current.getTemplate();
      // In a real application, you would save this JSON to a database.
      // For this example, we'll log it and show a toast.
      console.log('Saved Template:', templateJson);
      
      // Simulating a save operation
      setTimeout(() => {
        toast({
          title: 'Template Saved',
          description: 'Your spec sheet template has been saved successfully.',
        });
        setIsSaving(false);
      }, 1000);

    } catch (error) {
      console.error('Error saving template:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not save the template. Please try again.',
      });
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-4">
        <div className="flex justify-between items-center">
            <div>
                <h1 className="font-headline text-3xl font-bold tracking-tight">Template Maker</h1>
                <p className="text-muted-foreground">Design your product spec sheet templates.</p>
            </div>
            <Button onClick={onSaveTemplate} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isSaving ? 'Saving...' : 'Save Template'}
            </Button>
        </div>
        <div ref={designerRef} className="w-full h-full border rounded-lg overflow-hidden" />
    </div>
  );
}
