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
import React, { useState } from "react";

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

const readmeContent = `# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.`;

type SupportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SupportDialog({ open, onOpenChange }: SupportDialogProps) {
    const { toast } = useToast();
    const [formState, setFormState] = useState({ name: '', email: '', message: '' });

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormState(prevState => ({ ...prevState, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        console.log("Contact form submitted:", formState);
        toast({
            title: "Message Sent!",
            description: "Thanks for reaching out. We'll get back to you soon.",
        });
        setFormState({ name: '', email: '', message: '' });
        onOpenChange(false);
    };

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
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Name</Label>
                        <Input id="name" name="name" value={formState.name} onChange={handleInputChange} placeholder="Your Name" required />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" name="email" type="email" value={formState.email} onChange={handleInputChange} placeholder="your.email@example.com" required/>
                    </div>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="message">Message</Label>
                    <Textarea id="message" name="message" value={formState.message} onChange={handleInputChange} placeholder="How can we help you?" required/>
                </div>
                <Button type="submit" className="w-full">Send Message</Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
