
'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { findDataDiscrepancies, type FindDataDiscrepanciesOutput } from '@/ai/flows/find-data-discrepancies';
import { getFirebaseAuth, getFirestore } from '@/lib/firebase-admin';
import { scrapeKrowneWebsite, type ScrapeResult, type ScrapeError } from '@/services/web-scrapper'; // Import types
import { promises as fs } from 'fs';
import path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export async function logout() {
  redirect('/');
}

const syncSchema = z.object({
  productIdentifier: z.string().min(1, "Product identifier must not be empty."),
  includeWebScrapper: z.boolean(),
});

// Mock data fetching functions to simulate API calls
const getSalesforceData = (sku: string) => {
    return {
        product_name: 'Heavy Duty Faucet',
        sku: 'SKU-12345',
        price: 299.99,
        description: 'A durable and reliable faucet for commercial kitchens.',
        material: 'Stainless Steel',
        warranty_years: 5,
        series: 'Krowne Royal Series',
        standard_features: ['Ceramic valve', 'Lever handles', 'Swing spout'],
        compliances: 'NSF, AB1953',
        image_url_1: 'https://placehold.co/600x400.png'
    };
};

const getSalespadData = (sku: string) => {
    return {
        item_id: 'SKU-12345',
        description: 'Heavy Duty Commercial Faucet',
        list_price: 299.99,
        material: '304 Stainless Steel',
        flow_rate_gpm: 2.2,
        specifications_table: JSON.stringify([
            { name: 'Flow Rate', value: '2.2 GPM' },
            { name: 'Inlet Size', value: '1/2" NPT' }
        ])
    };
};

const getAutoquotesData = (sku: string) => {
    return {
        model_number: 'SKU-12345',
        product_name: 'Heavy Duty Faucet',
        price: 305.00, // Price discrepancy
        spec_sheet_id: 'SPEC-HD-FAUCET-01',
        warranty_desc: '5 Year Limited Warranty',
        image_url: 'https://placehold.co/600x400.png'
    };
};

const getWebsiteData = (sku: string) => {
    return {
        title: 'Heavy Duty Faucet - Commercial Grade',
        sku: 'SKU-12345',
        price: 299.99,
        short_description: 'A durable and reliable faucet for commercial kitchens.',
        material: 'Stainless Steel',
        flow_rate: '2.2 GPM',
        warranty: '5 Years',
        features: ['Heavy-duty brass construction', 'Ceramic disc cartridges', 'Chrome plated finish'],
        specifications: [{ spec: 'Weight', value: '8 lbs'}, {spec: 'Height', value: '12 inches'}],
        images: ['https://placehold.co/600x400.png', 'https://placehold.co/600x400.png']
    };
};

export type Discrepancy = {
    field: string;
    values: Record<string, string>;
};

export type ProductData = FindDataDiscrepanciesOutput['consolidatedData'];

export type ActionState = {
  productData?: ProductData;
  discrepancies?: Discrepancy[];
  summary?: string;
  error?: string | Record<string, string[] | undefined> | null;
  syncedAt?: string;
}

export async function getSyncData(prevState: any, formData: FormData): Promise<ActionState> {
  const validatedFields = syncSchema.safeParse({
    productIdentifier: formData.get('productIdentifier'),
    includeWebScrapper: formData.get('includeWebScrapper') === 'true',
  });

  if (!validatedFields.success) {
    return {
      error: validatedFields.error.flatten().fieldErrors,
    };
  }
  
  const { productIdentifier, includeWebScrapper } = validatedFields.data;
  const platformData: any = {};

  try {
    platformData.salesforce = getSalesforceData(productIdentifier) || {};
  } catch(e) {
    return { error: "Failed to fetch data from Salesforce." }
  }
  try {
    platformData.salespad = getSalespadData(productIdentifier) || {};
  } catch(e) {
    return { error: "Failed to fetch data from Salespad." }
  }
  try {
    platformData.autoquotes = getAutoquotesData(productIdentifier) || {};
  } catch(e) {
    return { error: "Failed to fetch data from Autoquotes." }
  }
  try {
    platformData.website = getWebsiteData(productIdentifier) || {};
  } catch(e) {
    return { error: "Failed to fetch data from Website CMS." }
  }

  if (includeWebScrapper) {
      try {
        const webScrapperData: ScrapeResult = await scrapeKrowneWebsite(productIdentifier);

        if (webScrapperData && 'error' in webScrapperData) {
            return { error: `Web Scrapper Error: ${webScrapperData.error}` };
        }
        
        platformData.webscrapper = webScrapperData || {};
      } catch(e) {
        return { error: "Failed to fetch data from Web Scrapper." }
      }
  } else {
    platformData.webscrapper = {};
  }


  if (Object.values(platformData).every((p: any) => Object.keys(p as object).length === 0)) {
      return { error: `No product found with identifier "${productIdentifier}".` };
  }

  try {
    const aiResult = await findDataDiscrepancies(platformData);
    
    return {
      productData: aiResult.consolidatedData,
      discrepancies: aiResult.discrepancies,
      summary: aiResult.summary,
      syncedAt: new Date().toISOString(),
    };
  } catch (e: any) {
      console.error("Error in AI processing:", e);
      return { error: "The AI failed to process the data. Please try again." };
  }
}

const contactSchema = z.object({
    name: z.string().min(1, 'Name is required.'),
    email: z.string().email('Invalid email address.'),
    message: z.string().min(10, 'Message must be at least 10 characters long.'),
});

export async function saveContactMessage(prevState: any, formData: FormData) {
    try {
        const validatedFields = contactSchema.safeParse({
            name: formData.get('name'),
            email: formData.get('email'),
            message: formData.get('message'),
        });

        if (!validatedFields.success) {
            return {
                error: validatedFields.error.flatten().fieldErrors,
            };
        }

        const { name, email, message } = validatedFields.data;
        const db = getFirestore();
        await db.collection('contact_messages').add({
            name,
            email,
            message,
            submittedAt: new Date(),
        });
        
        return { message: "Thanks for reaching out. We'll get back to you soon." };

    } catch (e: any) {
        console.error("Error saving contact message:", e);
        return { error: 'Failed to send message. Please try again later.' };
    }
}

async function createSpecSheetPdf(productData: ProductData): Promise<Uint8Array> {
  const templatePath = path.join(process.cwd(), 'public', 'templates', 'template.pdf');
  const existingPdfBytes = await fs.readFile(templatePath);

  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const pages = pdfDoc.getPages();
  const firstPage = pages[0];

  const { width, height } = firstPage.getSize();
  const fontSize = 10;
  const textColor = rgb(0, 0, 0);
  let yPosition = height - 50; 

  const drawText = (text: string, x: number, y: number, size = fontSize, font = helveticaFont) => {
    firstPage.drawText(text, { x, y, size, font, color: textColor, lineHeight: size + 4 });
    return size + 4; 
  };

  yPosition -= drawText(`Product Name: ${productData.name}`, 50, yPosition, 18);
  yPosition -= drawText(`SKU: ${productData.sku}`, 50, yPosition);
  if (productData.series) {
    yPosition -= drawText(`Series: ${productData.series}`, 50, yPosition);
  }

  yPosition -= 20; 
  if (productData.description) {
     yPosition -= drawText(`Description: ${productData.description}`, 50, yPosition);
  }
  
  if (productData.images && productData.images.length > 0) {
    try {
        const imageBytes = await fetch(productData.images[0]).then(res => res.arrayBuffer());
        const pdfImage = await pdfDoc.embedPng(imageBytes);
        const imageDims = pdfImage.scale(0.25);
        firstPage.drawImage(pdfImage, {
            x: width - imageDims.width - 50,
            y: height - imageDims.height - 50,
            width: imageDims.width,
            height: imageDims.height,
        });
    } catch (e) {
        console.error("Failed to embed image:", e);
    }
  }

  yPosition -= 20;
  if (productData.standardFeatures && productData.standardFeatures.length > 0) {
    yPosition -= drawText('Standard Features:', 50, yPosition, 14);
    productData.standardFeatures.forEach(feature => {
      yPosition -= drawText(`- ${feature}`, 60, yPosition);
    });
  }

  yPosition -= 20;
  if (productData.specifications && productData.specifications.length > 0) {
    yPosition -= drawText('Specifications:', 50, yPosition, 14);
    productData.specifications.forEach(spec => {
      yPosition -= drawText(`- ${spec.name}: ${spec.value}`, 60, yPosition);
    });
  }
  
  yPosition -= 20;
  if (productData.compliances && productData.compliances.length > 0) {
    yPosition -= drawText('Certifications:', 50, yPosition, 14);
    yPosition -= drawText(productData.compliances.join(', '), 60, yPosition);
  }

  return pdfDoc.save();
}

const generatePdfSchema = z.object({
  productData: z.string(),
});

type PdfActionState = {
  pdfBase64?: string;
  fileName?: string;
  error?: string;
}

export async function generateSpecSheetPdfAction(prevState: any, formData: FormData): Promise<PdfActionState> {
  const validatedFields = generatePdfSchema.safeParse({
    productData: formData.get('productData'),
  });

  if (!validatedFields.success) {
    return {
      error: "Invalid product data provided.",
    };
  }

  try {
    const productData: ProductData = JSON.parse(validatedFields.data.productData);
    const pdfBytes = await createSpecSheetPdf(productData);
    const pdfBase64 = Buffer.from(pdfBytes).toString('base64');

    return {
      pdfBase64,
      fileName: `${productData.sku || 'spec-sheet'}.pdf`,
    };
  } catch (e: any) {
    console.error("Error generating PDF:", e);
    return { error: 'Failed to generate PDF. Please try again later.' };
  }
}
