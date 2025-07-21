'use client';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { FileText, Loader2, UploadCloud } from "lucide-react";
import { useState } from "react";

export function PdfActions() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pdfGenerated, setPdfGenerated] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();
  
  const handleGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => {
        setIsGenerating(false);
        setPdfGenerated(true);
        toast({
            title: "PDF Generated",
            description: "Product data PDF is ready for upload."
        });
    }, 1500);
  };
  
  const handleUpload = () => {
    setIsUploading(true);
    setUploadProgress(0);
    const interval = setInterval(() => {
        setUploadProgress(prev => {
            if(prev >= 100) {
                clearInterval(interval);
                setIsUploading(false);
                setPdfGenerated(false);
                toast({
                    title: "Upload Successful",
                    description: "PDF has been uploaded to all platforms."
                });
                return 100;
            }
            return prev + 20;
        });
    }, 300);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline text-xl">Reporting</CardTitle>
        <CardDescription>Generate and distribute product data sheets.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={handleGenerate} disabled={isGenerating || pdfGenerated} className="w-full" variant="outline">
            {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            {isGenerating ? 'Generating...' : 'Generate Product PDF'}
        </Button>
        {isUploading && <Progress value={uploadProgress} className="w-full" />}
      </CardContent>
      <CardFooter>
        <Button onClick={handleUpload} disabled={!pdfGenerated || isUploading} className="w-full" variant="default">
            {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
            {isUploading ? `Uploading... ${uploadProgress}%` : 'Upload to Platforms'}
        </Button>
      </CardFooter>
    </Card>
  );
}
