
'use client';

import React, { useRef, useEffect, useState } from 'react';
import type { Template } from '@pdfme/ui';
import { generate } from '@pdfme/generator';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileText, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

type SavedTemplate = {
  name: string;
  template: Template;
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

// Function to flatten nested JSON for pdfme
const flattenObject = (obj: any, parentKey = '', result: {[key: string]: string} = {}) => {
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const newKey = parentKey ? `${parentKey}.${key}` : key;
            if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                flattenObject(obj[key], newKey, result);
            } else if (Array.isArray(obj[key])) {
                // Handle arrays of objects, commonly used for tables/lists
                 obj[key].forEach((item: any, index: number) => {
                    const arrayKey = `${newKey}.${index}`;
                    flattenObject(item, arrayKey, result);
                });
            }
            else {
                result[newKey] = String(obj[key]);
            }
        }
    }
    return result;
};


export default function PdfGeneratorPage() {
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<SavedTemplate | null>(null);
  const [jsonData, setJsonData] = useState('');

  useEffect(() => {
    const savedTemplatesJson = localStorage.getItem('specSheetTemplates');
    if (savedTemplatesJson) {
      const savedTemplates = JSON.parse(savedTemplatesJson);
      setTemplates(savedTemplates);
      if (savedTemplates.length > 0) {
        setSelectedTemplate(savedTemplates[0]);
      }
    }
  }, []);
  
  const sampleJson = {
    "product": {
      "name": "Heavy Duty Faucet",
      "sku": "SKU-12345",
      "description": "A durable and reliable faucet for commercial kitchens.",
      "price": "299.99"
    },
    "specs": [
      { "key": "Material", "value": "Stainless Steel" },
      { "key": "Flow Rate", "value": "2.2 GPM" },
      { "key": "Warranty", "value": "5 Years" }
    ]
  };

  useEffect(() => {
      setJsonData(JSON.stringify(sampleJson, null, 2));
  }, []);


  const onGeneratePdf = async () => {
    if (!selectedTemplate || !viewerRef.current) {
        toast({ variant: 'destructive', title: 'Error', description: 'Please select a template first.' });
        return;
    }
    
    let parsedJson;
    try {
        parsedJson = JSON.parse(jsonData);
    } catch(e) {
        toast({ variant: 'destructive', title: 'Invalid JSON', description: 'Please check your product data format.' });
        return;
    }
    
    // Flatten the JSON data to match pdfme's expected input format
    const inputs = [flattenObject(parsedJson)];

    setIsGenerating(true);
    try {
      const fonts = await loadFonts();
      const { Viewer } = await import('@pdfme/ui');
      
      const pdf = await generate({
        template: selectedTemplate.template,
        inputs: inputs,
        options: {
            font: fonts,
        }
      });

      const blob = new Blob([pdf.buffer], { type: 'application/pdf' });
      
      if (viewerRef.current) {
          viewerRef.current.innerHTML = ''; // Clear previous viewer
          // Note: The viewer might not display table data correctly without the table plugin,
          // but the generated PDF will be correct.
          const viewer = new Viewer({
              domContainer: viewerRef.current,
              template: selectedTemplate.template,
              inputs: inputs,
          });
          viewer.update(pdf);
      }
       
      toast({ title: 'PDF Generated', description: 'The PDF has been generated successfully.' });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        variant: 'destructive',
        title: 'Generation Error',
        description: `Could not generate the PDF. Error: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setIsGenerating(false);
    }
  };


  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-4">
        <div className="flex justify-between items-center">
            <div className="flex-1">
                <h1 className="font-headline text-3xl font-bold tracking-tight">Spec Sheet Generator</h1>
                <p className="text-muted-foreground">Generate a PDF from a template and your product data.</p>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1">
            {/* Left side: Controls */}
            <div className="flex flex-col gap-4">
                <div>
                    <Label htmlFor="template-select">Select Template</Label>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="w-full justify-between mt-1">
                            {selectedTemplate ? selectedTemplate.name : 'No templates found'}
                            <ChevronDown className="ml-auto" />
                        </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width]">
                        {templates.map(t => (
                            <DropdownMenuItem key={t.name} onSelect={() => setSelectedTemplate(t)}>
                            {t.name}
                            </DropdownMenuItem>
                        ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                <div className="flex-1 flex flex-col">
                    <Label htmlFor="json-data">Product Data (JSON)</Label>
                    <Textarea
                        id="json-data"
                        value={jsonData}
                        onChange={(e) => setJsonData(e.target.value)}
                        className="mt-1 flex-1 font-mono text-xs"
                        placeholder="Paste your product JSON here..."
                    />
                </div>

                <Button onClick={onGeneratePdf} disabled={isGenerating || !selectedTemplate}>
                    {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                    {isGenerating ? 'Generating...' : 'Generate PDF'}
                </Button>
            </div>

            {/* Right side: PDF Viewer */}
            <div className="w-full h-full border rounded-lg overflow-hidden bg-muted/30">
                <div ref={viewerRef} className="h-full w-full" />
            </div>
        </div>
    </div>
  );
}
