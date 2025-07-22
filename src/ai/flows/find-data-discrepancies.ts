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
});
export type FindDataDiscrepanciesInput = z.infer<typeof FindDataDiscrepanciesInputSchema>;

const DiscrepancySchema = z.object({
    field: z.string().describe('The data field with conflicting values.'),
    values: z.record(z.string()).describe('An object where keys are platform names and values are the conflicting data for that field.'),
});

const FindDataDiscrepanciesOutputSchema = z.object({
  discrepancies: z.array(DiscrepancySchema).describe('An array of identified discrepancies between the platforms.'),
  summary: z.string().describe('A brief summary of the findings.'),
});
export type FindDataDiscrepanciesOutput = z.infer<typeof FindDataDiscrepanciesOutputSchema>;

export async function findDataDiscrepancies(input: FindDataDiscrepanciesInput): Promise<FindDataDiscrepanciesOutput> {
  return findDataDiscrepanciesFlow(input);
}

const prompt = ai.definePrompt({
  name: 'findDataDiscrepanciesPrompt',
  input: {schema: FindDataDiscrepanciesInputSchema},
  output: {schema: FindDataDiscrepanciesOutputSchema},
  prompt: `You are an expert data analyst. You will be given product data from four different platforms: Salesforce, Salespad, Autoquotes, and Website CMS.

Your task is to meticulously compare the data from all platforms and identify every field where the values are not consistent across all sources.

For each field with a discrepancy, list the differing values from each platform. Ignore fields that are identical across all platforms or fields that only exist on some platforms. Focus only on fields that exist on multiple platforms but have different values.

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

Provide a summary of your findings and a structured list of the discrepancies.
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
