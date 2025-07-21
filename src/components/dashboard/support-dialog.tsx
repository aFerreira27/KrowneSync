'use client';

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import React, { useEffect, useRef } from "react";
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveContactMessage } from "@/lib/actions";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const faqData = [
  {
    question: "How do I connect a new platform?",
    answer:
      "Go to the user menu in the bottom-left, select 'Connections', and enter the API token for the platform you wish to connect. Click 'Save' to establish the connection.",
  },
  {
    question: "What format should the data be in for comparison?",
    answer:
      "The data should be in a valid JSON format. You can paste a JSON object representing your product data into the text areas on the dashboard.",
  },
  {
    question: "How does the AI generate suggestions?",
    answer:
      "The AI analyzes the data from both platforms, using Platform B as the source of truth. It identifies discrepancies in fields and values and suggests updates for Platform A to match Platform B.",
  },
  {
    question: "Can I generate a PDF report of my product data?",
    answer:
      "Yes, on the dashboard, you can use the 'Generate Product PDF' feature. Once generated, you can upload this PDF to all your connected platforms.",
  },
];

const readmeContent = `# KrowneSync: AI-Powered Data Synchronization

Welcome to KrowneSync, an intelligent application designed to streamline and automate the process of keeping your product data consistent across multiple platforms.

## Intended Functionality

KrowneSync solves the common and critical problem of data drift between different business systems. By leveraging the power of generative AI, it provides a centralized dashboard to:

1.  **Connect Platforms:** Securely connect to various data sources like Salesforce, Salespad, Autoquotes, and your Website CMS using authentication tokens.
2.  **Compare Data:** Paste product data (in JSON format) from two different platforms into the Data Synchronization tool.
3.  **AI-Powered Analysis:** The application sends the data to an AI model which intelligently identifies discrepancies between the two sources, using one as the "source of truth."
4.  **Get Suggestions:** The AI provides a clear summary of the differences, an impact assessment, and a list of actionable, suggested updates to resolve the inconsistencies.
5.  **Synchronize Data:** With a single click, apply the suggested changes to bring your data into alignment.
6.  **Generate Reports:** Create and distribute standardized product data sheets (PDFs) to all connected platforms.

## Tech Stack & Key Packages

The application is built on a modern, robust, and scalable tech stack:

-   **Frontend Framework:** Next.js (with App Router) provides a powerful React-based foundation for server-rendered pages and client-side interactivity.
-   **UI Library:** React is used for building the user interface.
-   **Styling:** Tailwind CSS is used for all styling, providing a utility-first approach for rapid and consistent design.
-   **UI Components:** We use ShadCN UI, a collection of beautifully designed and accessible components that are built on top of Tailwind CSS.
-   **Icons:** Lucide React provides a comprehensive and clean set of SVG icons.
-   **Authentication:** Firebase Authentication handles secure user sign-in, currently configured for Microsoft accounts.
-   **Generative AI:** Google's Gemini models are used via Genkit, an open-source AI framework that structures the calls to the large language models for analyzing data and generating suggestions.
-   **Schema Validation:** Zod is used to define and validate the structure of data passed to and from the AI models, ensuring data integrity.
-   **Language:** The entire application is written in TypeScript for enhanced code quality and type safety.
`;

type SupportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Sending...
        </>
      ) : (
        "Send Message"
      )}
    </Button>
  );
}

const initialState = {
    message: null,
    error: null,
};

export function SupportDialog({ open, onOpenChange }: SupportDialogProps) {
    const { toast } = useToast();
    const [state, formAction] = useActionState(saveContactMessage, initialState);
    const formRef = useRef<HTMLFormElement>(null);

    useEffect(() => {
        if (state.message) {
            toast({
                title: "Message Sent!",
                description: state.message,
            });
            formRef.current?.reset();
            onOpenChange(false);
        }
        if (state.error) {
            const errorMessage = typeof state.error === 'string' 
                ? state.error 
                : Object.values(state.error).flat().join(' ');
            
            toast({
                variant: "destructive",
                title: "Error",
                description: errorMessage || "An unexpected error occurred.",
            });
        }
    }, [state, toast, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-headline text-2xl">Support Center</DialogTitle>
          <DialogDescription>
            Get help, read our documentation, or contact us.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="faq" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="faq">FAQ</TabsTrigger>
            <TabsTrigger value="docs">Docs</TabsTrigger>
            <TabsTrigger value="contact">Contact Us</TabsTrigger>
          </TabsList>
          <TabsContent value="faq" className="mt-4">
            <Accordion type="single" collapsible className="w-full">
              {faqData.map((item, index) => (
                <AccordionItem value={`item-${index}`} key={index}>
                  <AccordionTrigger>{item.question}</AccordionTrigger>
                  <AccordionContent>{item.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </TabsContent>
          <TabsContent value="docs" className="mt-4">
            <div className="prose prose-sm max-h-[400px] overflow-y-auto rounded-md border bg-muted/50 p-4">
                <pre className="whitespace-pre-wrap font-sans text-sm">{readmeContent}</pre>
            </div>
          </TabsContent>
          <TabsContent value="contact" className="mt-4">
            <form ref={formRef} action={formAction} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Name</Label>
                        <Input id="name" name="name" placeholder="Your Name" required />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" name="email" type="email" placeholder="your.email@example.com" required/>
                    </div>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="message">Message</Label>
                    <Textarea id="message" name="message" placeholder="How can we help you?" required/>
                </div>
                <SubmitButton />
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
