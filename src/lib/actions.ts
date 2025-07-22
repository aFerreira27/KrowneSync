
'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { findDataDiscrepancies, type FindDataDiscrepanciesOutput } from '@/ai/flows/find-data-discrepancies';
import { getFirebaseAuth, getFirestore } from '@/lib/firebase-admin';
import { scrapeKrowneWebsite, type ScrapeResult, type ScrapeError } from '@/services/web-scrapper'; // Import types
import { generatePdf } from '@/lib/pdf-generator';

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

export type ActionState = {
  productData?: FindDataDiscrepanciesOutput['consolidatedData'];
  discrepancies?: Discrepancy[];
  summary?: string;
  error?: string | any;
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
        const webScrapperData: ScrapeResult = await scrapeKrowneWebsite(productIdentifier); // Add type annotation

        // Check if webScrapperData is not null and is a ScrapeError
        if (webScrapperData && 'error' in webScrapperData) { // Use type guard
            return { error: `Web Scrapper Error: ${webScrapperData.error}` };
        }
        
        // If not an error, it's either ScrapeSuccess or null
        platformData.webscrapper = webScrapperData || {};
      } catch(e) {
        return { error: "Failed to fetch data from Web Scrapper." }
      }
  } else {
    platformData.webscrapper = {};
  }


  // If no data is found on any platform, return an error.
  if (Object.values(platformData).every(p => Object.keys(p).length === 0)) {
      return { error: `No product found with identifier "${productIdentifier}".` };
  }

  try {
    const aiResult = await findDataDiscrepancies(platformData);
    
    return {
      productData: aiResult.consolidatedData,
      discrepancies: aiResult.discrepancies,
      summary: aiResult.summary,
      syncedAt: new Date().toISOString(), // Add timestamp for sync status
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

// Define the updated interface for your product data
interface ProductData {
  sku: string;
  name: string;
  series?: string;
  images: string[];
  description: string;
  standardFeatures: string[];
  specifications: { name: string; value: string; }[];
  compliances: string[];
}

export async function scrapeAndGeneratePdf(productData: ProductData): Promise<Uint8Array> {
  // In a real-world scenario, you might scrape data here,
  // but for this function, we assume productData is already available.

  // Format the product data for the PDF
  let pdfContent = `Product Name: ${productData.name}
`;
  pdfContent += `SKU: ${productData.sku}
`;
  if (productData.series) {
    pdfContent += `Series: ${productData.series}
`;
  }
  pdfContent += `
Description: ${productData.description}
`;

  if (productData.images && productData.images.length > 0) {
    pdfContent += `
Product Image: ${productData.images[0]}
`;
  }

  pdfContent += `
2D Drawing: [Placeholder for 2D Drawing]
`;
  
  if (productData.standardFeatures && productData.standardFeatures.length > 0) {
      pdfContent += `
Standard Features:
${productData.standardFeatures.map(feature => `- ${feature}`).join('\n')}
`;
  }

  if (productData.specifications && productData.specifications.length > 0) {
      pdfContent += `
Specifications:
${productData.specifications.map(spec => `- ${spec.name}: ${spec.value}`).join('\n')}
`;
  }

  if (productData.compliances && productData.compliances.length > 0) {
      pdfContent += `
Certifications:
${productData.compliances.join(', ')}
`;
  }


  // Generate the PDF using the generatePdf function
  const pdfBytes = await generatePdf(pdfContent);

  return pdfBytes;
}
