
'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { Designer } from '@pdfme/ui';
import type { Template, Schema } from '@pdfme/common';
import { BLANK_PDF as BLANK_A4_PDF } from '@pdfme/common';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Plus, Trash2, ChevronDown, Edit, ArrowUpToLine, ArrowDownToLine } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  productNameSchema,
  skuSchema,
  descriptionSchema,
  standardFeaturesSchema,
  specificationsTableSchema,
} from '@/lib/pdfSchemas';
import { image, table, text } from '@pdfme/schemas';


// Helper to fetch an asset and convert it to a base64 data URI
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
    }
  ],
};

type SavedTemplate = {
  name: string;
  template: Template;
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
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<SavedTemplate | null>(null);

  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<SavedTemplate | null>(null);
  const [isNewTemplateDialogOpen, setIsNewTemplateDialogOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");

  const addHeader = useCallback(async () => {
    if (!designer.current) return;
    try {
        const headerDataUri = await getAssetAsDataUri('/images/Header.svg');
        if (!headerDataUri) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not load header image.' });
            return;
        }
        
        designer.current.updateTemplate({
            ...designer.current.getTemplate(),
            staticImages: [...(designer.current.getTemplate().staticImages || []), {
              image: headerDataUri,
              position: { x: 0, y: 0 },
              width: 210,
              height: 40,
            }]
        });

        toast({ title: 'Header Added', description: 'Header image has been added to the template.' });
    } catch (error) {
        console.error('Error adding header:', error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not add header.' });
    }
  }, [toast]);

  const addFooter = useCallback(async () => {
    if (!designer.current) return;
    try {
        const footerDataUri = await getAssetAsDataUri('/images/Footer.svg');
        if (!footerDataUri) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not load footer image.' });
            return;
        }
        
        designer.current.updateTemplate({
            ...designer.current.getTemplate(),
            staticImages: [...(designer.current.getTemplate().staticImages || []), {
              image: footerDataUri,
              position: { x: 0, y: 257 },
              width: 210,
              height: 40,
            }]
        });
        
        toast({ title: 'Footer Added', description: 'Footer image has been added to the template.' });
    } catch (error) {
        console.error('Error adding footer:', error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not add footer.' });
    }
  }, [toast]);

  // Enhanced localStorage operations with better error handling
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedTemplatesJson = localStorage.getItem('specSheetTemplates');
        let savedTemplates: SavedTemplate[] = [];

        if (savedTemplatesJson) {
          const parsed = JSON.parse(savedTemplatesJson);
          savedTemplates = parsed.map((t: any) => ({
            name: t.name,
            template: t.template
          }));
        }

        if (savedTemplates.length === 0) {
          const defaultTemplate = { name: 'Default Spec Sheet', template: BLANK_TEMPLATE };
          savedTemplates.push(defaultTemplate);
          localStorage.setItem('specSheetTemplates', JSON.stringify(savedTemplates));
          setTemplates(savedTemplates);
          setSelectedTemplate(savedTemplates[0]);
        } else {
             setTemplates(savedTemplates);
             setSelectedTemplate(savedTemplates[0]);
        }

      } catch (error) {
        console.error('Error loading templates from localStorage:', error);
        const defaultTemplate = { name: 'Default Spec Sheet', template: BLANK_TEMPLATE };
        setTemplates([defaultTemplate]);
        setSelectedTemplate(defaultTemplate);
      }
    }
  }, []);


  useEffect(() => {
    if (!selectedTemplate || !designerRef.current) return;

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
              template: selectedTemplate.template,
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
  }, [toast, selectedTemplate]);

  const onSaveTemplate = () => {
    if (!designer.current || !selectedTemplate) return;

    setIsSaving(true);
    try {
      const currentTemplate = designer.current.getTemplate();

      const updatedTemplates = templates.map(t =>
        t.name === selectedTemplate.name ? { ...t, template: currentTemplate } : t
      );
      setTemplates(updatedTemplates);

      if (typeof window !== 'undefined') {
        localStorage.setItem('specSheetTemplates', JSON.stringify(updatedTemplates));
      }

      setTimeout(() => {
        toast({
          title: 'Template Saved',
          description: `Template "${selectedTemplate.name}" has been saved successfully.`,
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

  const handleCreateNewTemplate = () => {
    if (!newTemplateName.trim()) {
      toast({ variant: 'destructive', title: 'Error', description: 'Template name cannot be empty.' });
      return;
    }
    if (templates.some(t => t.name === newTemplateName.trim())) {
      toast({ variant: 'destructive', title: 'Error', description: 'A template with this name already exists.' });
      return;
    }

    try {
      const newTemplate: SavedTemplate = { name: newTemplateName.trim(), template: BLANK_TEMPLATE };
      const updatedTemplates = [...templates, newTemplate];

      setTemplates(updatedTemplates);
      setSelectedTemplate(newTemplate);

      if (typeof window !== 'undefined') {
        localStorage.setItem('specSheetTemplates', JSON.stringify(updatedTemplates));
      }

      toast({ title: 'Template Created', description: `Successfully created "${newTemplate.name}".` });
      setNewTemplateName("");
      setIsNewTemplateDialogOpen(false);

    } catch (error) {
      console.error('Error creating template:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to create template.' });
    }
  };

  const handleDeleteTemplate = () => {
    if (!templateToDelete) return;

    if (templates.length <= 1) {
        toast({ variant: 'destructive', title: 'Cannot Delete', description: 'You must have at least one template.' });
        setIsDeleteAlertOpen(false);
        setTemplateToDelete(null);
        return;
    }

    try {
      const updatedTemplates = templates.filter(t => t.name !== templateToDelete.name);
      setTemplates(updatedTemplates);

      if (typeof window !== 'undefined') {
        localStorage.setItem('specSheetTemplates', JSON.stringify(updatedTemplates));
      }

      toast({ title: 'Template Deleted', description: `Template "${templateToDelete.name}" has been deleted.` });

      if (selectedTemplate?.name === templateToDelete.name) {
        setSelectedTemplate(updatedTemplates[0] || null);
      }

      setIsDeleteAlertOpen(false);
      setTemplateToDelete(null);
    } catch (error) {
      console.error('Error deleting template:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete template.' });
    }
  };

  const openDeleteDialog = (template: SavedTemplate, e: React.MouseEvent) => {
      e.stopPropagation();
      setTemplateToDelete(template);
      setIsDeleteAlertOpen(true);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-4">
        <div className="flex justify-between items-center">
            <div className="flex-1">
                <h1 className="font-headline text-3xl font-bold tracking-tight">Template Editor</h1>
                <p className="text-muted-foreground">Design your product spec sheet templates. Name fields to auto-populate them in the generator.</p>
            </div>
             <div className="flex-1 flex justify-center items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="min-w-64">
                    <Edit className="mr-2" />
                    {selectedTemplate ? selectedTemplate.name : 'Select a Template'}
                    <ChevronDown className="ml-auto" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64">
                  <DropdownMenuItem onSelect={() => setIsNewTemplateDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4"/>
                    <span>Create New Template</span>
                  </DropdownMenuItem>
                   <DropdownMenuSeparator />
                  {templates.map(t => (
                    <DropdownMenuItem key={t.name} onSelect={() => setSelectedTemplate(t)} className={cn("justify-between", selectedTemplate?.name === t.name && "bg-accent")}>
                      <span>{t.name}</span>
                      <button
                        onClick={(e) => openDeleteDialog(t, e)}
                        className="p-1 rounded hover:bg-destructive/80 hover:text-destructive-foreground text-muted-foreground"
                        disabled={templates.length <= 1}
                        title={`Delete "${t.name}"`}
                      >
                          <Trash2 className="h-4 w-4"/>
                      </button>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex-1 flex justify-end items-center gap-2">
               <Button onClick={addHeader} variant="outline" size="sm" disabled={isLoading || !selectedTemplate}>
                  <ArrowUpToLine className="mr-2"/>
                  Add Header
              </Button>
              <Button onClick={addFooter} variant="outline" size="sm" disabled={isLoading || !selectedTemplate}>
                  <ArrowDownToLine className="mr-2"/>
                  Add Footer
              </Button>
              <Button onClick={onSaveTemplate} disabled={isSaving || isLoading || !selectedTemplate}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  {isSaving ? 'Saving...' : 'Save Template'}
              </Button>
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

        <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the
                        <span className="font-semibold"> {templateToDelete?.name} </span>
                        template.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setTemplateToDelete(null)}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteTemplate} className="bg-destructive hover:bg-destructive/90">
                        Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <Dialog open={isNewTemplateDialogOpen} onOpenChange={setIsNewTemplateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Template</DialogTitle>
              <DialogDescription>
                Enter a name for your new template.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="template-name" className="text-right">Name</Label>
                    <Input
                        id="template-name"
                        value={newTemplateName}
                        onChange={(e) => setNewTemplateName(e.target.value)}
                        className="col-span-3"
                        placeholder="e.g., A4 Spec Sheet"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleCreateNewTemplate();
                          }
                        }}
                    />
                </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsNewTemplateDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateNewTemplate}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  );
}

    