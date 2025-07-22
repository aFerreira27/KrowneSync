
'use client';

import React, { useRef, useEffect, useState } from 'react';
import type { Designer } from '@pdfme/ui';
import type { Template } from '@pdfme/common';
import { BLANK_A4_PDF } from '@pdfme/common';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

import {
  productNameSchema,
  skuSchema,
  descriptionSchema,
  standardFeaturesSchema,
  specificationsTableSchema,
  headerImageSchema,
  footerImageSchema,
} from '@/lib/pdfSchemas';
import { image, table, text } from '@pdfme/schemas';

// Helper to fetch an asset and convert it to a base64 data URI (kept for potential future use)
const getAssetAsDataUri = async (path: string): Promise<string> => {
    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Failed to fetch asset: ${path}`);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error(`Error loading asset ${path}:`, error);
        return '';
    }
};

const BLANK_TEMPLATE: Template = {
  basePdf: BLANK_A4_PDF,
  schemas: [
    { ...headerImageSchema },
    {
      ...productNameSchema,
      position: { x: 20, y: 50 },
    },
    {
      ...skuSchema,
       position: { x: 20, y: 60 },
    },
    {
      ...descriptionSchema,
      position: { x: 20, y: 75 },
      height: 20,
    },
    {
      ...standardFeaturesSchema,
      position: { x: 20, y: 100 },
      height: 40,
    },
     {
      ...specificationsTableSchema,
      position: { x: 20, y: 150 },
      height: 80,
    },
    { ...footerImageSchema }
  ],
};

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
      const fontObject: { [key: string]: any } = { data: fontData };

      if (name === 'HelveticaNeueLTStd-Roman') {
        fontObject.fallback = true;
      }

      return { [name]: fontObject };

    } catch (error) {
      console.error(`An error occurred while fetching font ${name}:`, error);
      return null;
    }
  });

  const fontDataArray = await Promise.all(fontPromises);
  return Object.assign({}, ...fontDataArray.filter(Boolean));
};

export default function TemplateMakerPage() {
  const designerRef = useRef<HTMLDivElement | null>(null);
  const designer = useRef<Designer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (!designerRef.current) return;

    const initializeDesigner = async () => {
      setIsLoading(true);
      try {
        const { Designer } = await import('@pdfme/ui');
        
        if (designer.current) {
          designer.current.destroy();
          designer.current = null;
        }

        const fonts = await loadFonts();
        if (Object.keys(fonts).length === 0) {
          console.warn('No fonts loaded, using default fonts');
        }

        if (designerRef.current) {
            designer.current = new Designer({
              domContainer: designerRef.current,
              template: BLANK_TEMPLATE,
              options: {
                font: fonts,
                labels: {
                  zoom: 'Fit to page',
                },
                plugins: {
                    image,
                    table,
                    text,
                },
              }
            });
        }
      } catch (error) {
        console.error('Error loading fonts or initializing designer:', error);
        toast({
          variant: 'destructive',
          title: 'Initialization Error',
          description: `Could not initialize the template designer. Error: ${error instanceof Error ? error.message : String(error)}`,
        });
      } finally {
        setIsLoading(false);
      }
    };

    initializeDesigner();

    return () => {
      if (designer.current) {
        designer.current.destroy();
        designer.current = null;
      }
    };
  }, [toast]);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-4">
        <div className="flex justify-between items-center">
            <div className="flex-1">
                <h1 className="font-headline text-3xl font-bold tracking-tight">Template Editor</h1>
                <p className="text-muted-foreground">Design your product spec sheet templates. Name fields to auto-populate them in the generator.</p>
            </div>
             {/* Removed template selection/creation UI */}
        </div>
        <div className="w-full h-full border rounded-lg overflow-hidden flex justify-start relative">
          {isLoading && (
            <div className="w-full h-full p-4 absolute inset-0 z-10 bg-background/50 flex items-center justify-center">
                <div className="flex items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <p className="text-muted-foreground">Loading Designer...</p>
                </div>
            </div>
          )}
          <div ref={designerRef} className={`flex-1 h-full ${isLoading ? 'opacity-0' : ''}`} />
        </div>

        {/* Removed dialogs and alert dialog */}
    </div>
  );
}
