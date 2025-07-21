
'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Designer } from '@pdfme/ui';
import { Template, BLANK_PDF } from '@pdfme/common';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const initialTemplate: Template = {
  basePdf: BLANK_PDF,
  schemas: [
    {
      a: {
        type: 'text',
        position: { x: 25, y: 25 },
        width: 150,
        height: 20,
        content: 'Product Spec Sheet',
        fontName: 'HelveticaNeueLTStd-Bd',
        fontSize: 24,
      },
      b: {
        type: 'text',
        position: { x: 25, y: 55 },
        width: 80,
        height: 10,
        content: 'Product Name:',
        fontName: 'HelveticaNeueLTStd-Roman',
        fontSize: 12,
      },
      c: {
        type: 'text',
        position: { x: 25, y: 70 },
        width: 80,
        height: 10,
        content: 'Description:',
        fontName: 'HelveticaNeueLTStd-Roman',
        fontSize: 12,
      },
    },
  ],
};

// Helper function to fetch fonts
const loadFonts = async () => {
  const fontFileNames = [
    'HelveticaNeueLTStd-Bd',
    'HelveticaNeueLTStd-BdCn',
    'HelveticaNeueLTStd-Hv',
    'HelveticaNeueLTStd-HvCn',
    'HelveticaNeueLTStd-Lt',
    'HelveticaNeueLTStd-LtCnO',
    'HelveticaNeueLTStd-Md',
    'HelveticaNeueLTStd-MdCnO',
    'HelveticaNeueLTStd-Roman',
    'HelveticaNeueLTStd-Th',
    'HelveticaNeueLTStd-UltLt',
  ];
  
  const fontPromises = fontFileNames.map(async (name) => {
    try {
      const response = await fetch(`/fonts/${name}.otf`);
      if (!response.ok) {
        console.warn(`Could not load font: ${name}.otf. File not found.`);
        return null; 
      }
      const fontData = await response.arrayBuffer();
      // pdfme expects the font data to be in an object with a 'data' property
      return { [name]: { data: fontData } };
    } catch (error) {
      console.error(`An error occurred while fetching font ${name}:`, error);
      return null; 
    }
  });

  const fontDataArray = await Promise.all(fontPromises);
  // Filter out nulls and merge the font data objects
  return Object.assign({}, ...fontDataArray.filter(Boolean));
};


export default function TemplateMakerPage() {
  const designerRef = useRef<HTMLDivElement | null>(null);
  const designer = useRef<Designer | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    let newDesigner: Designer | null = null;

    const initializeDesigner = async () => {
      try {
        if (designerRef.current) {
          const fonts = await loadFonts();
          if (Object.keys(fonts).length === 0) {
            toast({
              variant: 'destructive',
              title: 'Error Loading Fonts',
              description: 'Could not load any custom fonts. Please ensure they are in the public/fonts directory.',
            });
            setIsLoading(false);
            return;
          }

          newDesigner = new Designer({
            domContainer: designerRef.current,
            template: initialTemplate,
            options: {
              font: fonts,
            }
          });
          designer.current = newDesigner;
        }
      } catch (error) {
        console.error('Error loading fonts or initializing designer:', error);
        toast({
          variant: 'destructive',
          title: 'Initialization Error',
          description: 'Could not initialize the template designer. Please try again.',
        });
      } finally {
        setIsLoading(false);
      }
    };

    initializeDesigner();

    return () => {
      if (newDesigner) {
        newDesigner.destroy();
      }
    };
  }, [toast]);
  
  const onSaveTemplate = () => {
    if (!designer.current) return;
    setIsSaving(true);
    try {
      const templateJson = designer.current.getTemplate();
      // In a real application, you would save this JSON to a database.
      // For this example, we'll log it and show a toast.
      console.log('Saved Template:', JSON.stringify(templateJson, null, 2));
      
      localStorage.setItem('specSheetTemplate', JSON.stringify(templateJson));

      // Simulating a save operation
      setTimeout(() => {
        toast({
          title: 'Template Saved',
          description: 'Your spec sheet template has been saved successfully locally.',
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
            <Button onClick={onSaveTemplate} disabled={isSaving || isLoading}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isSaving ? 'Saving...' : 'Save Template'}
            </Button>
        </div>
        {isLoading && (
          <div className="w-full h-full border rounded-lg overflow-hidden p-4">
              <Skeleton className="h-16 w-1/2 mb-4" />
              <Skeleton className="h-full w-full" />
          </div>
        )}
        <div ref={designerRef} className={`w-full h-full border rounded-lg overflow-hidden ${isLoading ? 'hidden' : ''}`} />
    </div>
  );
}
