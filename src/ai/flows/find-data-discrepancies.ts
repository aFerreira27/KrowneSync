'use server';
/**
 * @fileOverview A flow that finds discrepancies in product data across multiple platforms.
 * 
 * - findDataDiscrepancies - A function that identifies differences in product data.
 * - FindDataDiscrepanciesInput - The input type for the findDataDiscrepancies function.
 * - FindDataDiscrepanciesOutput - The return type for the findDataDiscrepancies function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ProductDataSchema = z.record(z.any()).describe('A JSON object representing product data from a single platform.');

const FindDataDiscrepanciesInputSchema = z.object({
  salesforce: ProductDataSchema,
  salespad: ProductDataSchema,
  autoquotes: ProductDataSchema,
  website: ProductDataSchema,
  webscrapper: ProductDataSchema,
});
export type FindDataDiscrepanciesInput = z.infer<typeof FindDataDiscrepanciesInputSchema>;

const DiscrepancySchema = z.object({
    field: z.string().describe('The data field with conflicting values.'),
    values: z.record(z.string()).describe('An object where keys are platform names and values are the conflicting data for that field.'),
});

const SpecificationSchema = z.object({
    name: z.string().describe('The name of the specification (e.g., "Voltage").'),
    value: z.string().describe('The value of the specification (e.g., "120V").'),
});

const ConsolidatedDataSchema = z.object({
  name: z.string().describe('The most common or accurate product name.'),
  sku: z.string().describe('The product SKU or identifier.'),
  series: z.string().describe('The product series or family.').optional(),
  images: z.array(z.string().url()).describe('An array of URLs for product images.'),
  description: z.string().describe('A detailed product description.'),
  standardFeatures: z.array(z.string()).describe('A list of the product\'s standard features.'),
  specifications: z.array(SpecificationSchema).describe('A table-like structure of technical specifications.'),
  compliances: z.array(z.string()).describe('A list of compliance certifications (e.g., "NSF Certified").'),
});


const FindDataDiscrepanciesOutputSchema = z.object({
  discrepancies: z.array(DiscrepancySchema).describe('An array of identified discrepancies between the platforms.'),
  summary: z.string().describe('A brief summary of the findings.'),
  consolidatedData: ConsolidatedDataSchema.describe('The aggregated and cleaned product data.'),
});
export type FindDataDiscrepanciesOutput = z.infer<typeof FindDataDiscrepanciesOutputSchema>;

export async function findDataDiscrepancies(input: FindDataDiscrepanciesInput): Promise<FindDataDiscrepanciesOutput> {
  return findDataDiscrepanciesFlow(input);
}

const prompt = ai.definePrompt({
  name: 'findDataDiscrepanciesPrompt',
  input: {schema: FindDataDiscrepanciesInputSchema},
  output: {schema: FindDataDiscrepanciesOutputSchema},
  prompt: `You are an expert data analyst. You will be given product data from five different platforms: Salesforce, Salespad, Autoquotes, Website CMS, and a Web Scrapper.

Your first task is to meticulously compare the data from all platforms and identify every field where the values are not consistent across all sources.
For each field with a discrepancy, list the differing values from each platform. Ignore fields that are identical across all platforms or fields that only exist on some platforms. Focus only on fields that exist on multiple platforms but have different values.

Your second task is to aggregate all the available information into a single, clean, and comprehensive product profile. Use the most likely correct value if there are discrepancies.
The consolidated data should include:
- A clear product name, sku, and series.
- An array of all available image URLs.
- A well-written product description.
- A bulleted list of standard features.
- A structured list of technical specifications.
- A list of all compliance certifications.

Salesforce Data:
\`\`\`json
{{{json stringify=salesforce}}}
\`\`\`

Salespad Data:
\`\`\`json
{{{json stringify=salespad}}}
\`\`\`

Autoquotes Data:
\`\`\`json
{{{json stringify=autoquotes}}}
\`\`\`

Website CMS Data:
\`\`\`json
{{{json stringify=website}}}
\`\`\`

Web Scrapper Data:
\`\`\`json
{{{json stringify=webscrapper}}}
\`\`\`

Provide a summary of your findings, a structured list of the discrepancies, and the final consolidated product data.
`,
});

const findDataDiscrepanciesFlow = ai.defineFlow(
  {
    name: 'findDataDiscrepanciesFlow',
    inputSchema: FindDataDiscrepanciesInputSchema,
    outputSchema: FindDataDiscrepanciesOutputSchema,
  },
  async (input) => {
    const {output} = await prompt(input);
    return output!;
  }
);
