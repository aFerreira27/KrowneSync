
'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Designer } from '@pdfme/ui';
import { Template, BLANK_PDF } from '@pdfme/common';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Plus, Trash2, ChevronDown, Edit } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
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

const BLANK_TEMPLATE: Template = {
  basePdf: BLANK_PDF,
  schemas: [
    {
      a: {
        type: 'text',
        position: { x: 25, y: 25 },
        width: 150,
        height: 20,
        content: 'New Product Spec Sheet',
        fontName: 'HelveticaNeueLTStd-Bd',
        fontSize: 24,
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

type SavedTemplate = {
  name: string;
  template: Template;
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


  useEffect(() => {
    const savedTemplatesJson = localStorage.getItem('specSheetTemplates');
    const savedTemplates = savedTemplatesJson ? JSON.parse(savedTemplatesJson) : [];
    
    if (savedTemplates.length === 0) {
      const defaultTemplate = { name: 'Default Spec Sheet', template: BLANK_TEMPLATE };
      savedTemplates.push(defaultTemplate);
      localStorage.setItem('specSheetTemplates', JSON.stringify(savedTemplates));
    }
    
    setTemplates(savedTemplates);
    setSelectedTemplate(savedTemplates[0]);

  }, []);

  useEffect(() => {
    let newDesigner: Designer | null = null;
    if (!selectedTemplate) return;

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
            template: selectedTemplate.template,
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
          description: `Could not initialize the template designer. Error: ${error instanceof Error ? error.message : String(error)}`,
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
  }, [toast, selectedTemplate]);

  const onSaveTemplate = () => {
    if (!designer.current || !selectedTemplate) return;
    setIsSaving(true);
    try {
      const templateJson = designer.current.getTemplate();
      const updatedTemplates = templates.map(t => 
        t.name === selectedTemplate.name ? { ...t, template: templateJson } : t
      );
      setTemplates(updatedTemplates);
      localStorage.setItem('specSheetTemplates', JSON.stringify(updatedTemplates));
      
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

    const newTemplate: SavedTemplate = { name: newTemplateName.trim(), template: BLANK_TEMPLATE };
    const updatedTemplates = [...templates, newTemplate];
    
    setTemplates(updatedTemplates);
    setSelectedTemplate(newTemplate);
    localStorage.setItem('specSheetTemplates', JSON.stringify(updatedTemplates));

    toast({ title: 'Template Created', description: `Successfully created "${newTemplate.name}".` });
    setNewTemplateName("");
    setIsNewTemplateDialogOpen(false);
  };

  const handleDeleteTemplate = () => {
    if (!templateToDelete) return;

    if (templates.length <= 1) {
        toast({ variant: 'destructive', title: 'Cannot Delete', description: 'You must have at least one template.' });
        setIsDeleteAlertOpen(false);
        setTemplateToDelete(null);
        return;
    }

    const updatedTemplates = templates.filter(t => t.name !== templateToDelete.name);
    setTemplates(updatedTemplates);
    localStorage.setItem('specSheetTemplates', JSON.stringify(updatedTemplates));
    
    toast({ title: 'Template Deleted', description: `Template "${templateToDelete.name}" has been deleted.` });
    
    if (selectedTemplate?.name === templateToDelete.name) {
      setSelectedTemplate(updatedTemplates[0] || null);
    }

    setIsDeleteAlertOpen(false);
    setTemplateToDelete(null);
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
                <h1 className="font-headline text-3xl font-bold tracking-tight">Template Maker</h1>
                <p className="text-muted-foreground">Design your product spec sheet templates.</p>
            </div>
            <div className="flex-1 flex justify-center">
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
            <div className="flex-1 flex justify-end">
              <Button onClick={onSaveTemplate} disabled={isSaving || isLoading || !selectedTemplate}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  {isSaving ? 'Saving...' : 'Save Template'}
              </Button>
            </div>
        </div>
        {isLoading && (
          <div className="w-full h-full border rounded-lg overflow-hidden p-4">
              <Skeleton className="h-16 w-1/2 mb-4" />
              <Skeleton className="h-full w-full" />
          </div>
        )}
        <div ref={designerRef} className={`w-full h-full border rounded-lg overflow-hidden ${isLoading ? 'hidden' : ''}`} />

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
