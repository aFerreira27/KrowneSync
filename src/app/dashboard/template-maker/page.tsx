
'use client';

import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import React, { useRef, useEffect, useState } from 'react';
import type { Template } from '@pdfme/common';
import { Designer } from '@pdfme/ui';
import { image, table, text } from '@pdfme/schemas';

// Define schemas directly in the file
const headerImageSchema = {
    type: 'image',
    position: { x: 0, y: 0 },
    width: 210,
    height: 30,
    key: 'header_image',
    content: '/images/Header.svg'
};

const footerImageSchema = {
    type: 'image',
    position: { x: 0, y: 267 },
    width: 210,
    height: 30,
    key: 'footer_image',
    content: '/images/Footer.svg'
};

const productNameSchema = {
  key: 'product.name',
  type: 'text',
  position: { x: 15, y: 35 },
  width: 180,
  height: 15,
  fontSize: 24,
  fontColor: '#000000',
  alignment: 'left',
  fontName: 'HelveticaNeueLTStd-Bd',
};

const skuSchema = {
  key: 'product.sku',
  type: 'text',
  position: { x: 15, y: 52 },
  width: 180,
  height: 8,
  fontSize: 14,
  fontColor: '#555555',
  alignment: 'left',
  fontName: 'HelveticaNeueLTStd-Roman',
};

const descriptionSchema = {
  key: 'product.description',
  type: 'text',
  position: { x: 15, y: 65 },
  width: 180,
  height: 25,
  fontSize: 12,
  fontColor: '#333333',
  alignment: 'left',
  fontName: 'HelveticaNeueLTStd-Roman',
  lineHeight: 1.5,
};

const standardFeaturesSchema = {
  key: 'product.standardFeatures',
  type: 'text',
  position: { x: 15, y: 100 },
  width: 85,
  height: 80,
  fontSize: 12,
  fontColor: '#333333',
  alignment: 'left',
  fontName: 'HelveticaNeueLTStd-Roman',
  lineHeight: 1.5,
};

const specificationsTableSchema = {
    key: 'specs',
    type: 'table',
    position: { x: 15, y: 190 },
    width: 180,
    height: 60,
    rows: [
        ['Key', 'Value'],
        ['Material', 'product.specs.0.value'],
        ['Flow Rate', 'product.specs.1.value'],
        ['Warranty', 'product.specs.2.value'],
    ],
    showHead: true,
    headFontColor: '#ffffff',
    headBgColor: '#000000',
    fontName: 'HelveticaNeueLTStd-Roman',
};

// This is the array of schemas for a single page.
const BASE_SCHEMAS = [
  headerImageSchema,
  footerImageSchema,
  productNameSchema,
  skuSchema,
  descriptionSchema,
  standardFeaturesSchema,
  specificationsTableSchema,
];


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
        if (!response.ok) return null;
        const fontData = await response.arrayBuffer();
        const fontObject: { [key: string]: any } = { data: fontData };
        if (name === 'HelveticaNeueLTStd-Roman') fontObject.fallback = true;
        return { [name]: fontObject };
      } catch (error) {
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
        }

        const fonts = await loadFonts();
        if (Object.keys(fonts).length === 0) {
          console.warn('No fonts loaded, using default fonts');
        }
        
        const response = await fetch('/templates/template.pdf');
        if (!response.ok) {
            throw new Error('Failed to load base PDF template.');
        }
        const basePdf = await response.arrayBuffer();
        
        // Correctly structure the template with schemas as an array of arrays
        const template: Template = {
            basePdf: basePdf,
            schemas: [BASE_SCHEMAS],
        };
        
        if (designerRef.current) {
            designer.current = new Designer({
              domContainer: designerRef.current,
              template: template,
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
                },
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
    </div>
  );
}
