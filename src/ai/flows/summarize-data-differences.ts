'use server';
/**
 * @fileOverview Summarizes data differences between databases and highlights potential impacts on data integrity.
 *
 * - summarizeDataDifferences - A function that summarizes data differences.
 * - SummarizeDataDifferencesInput - The input type for the summarizeDataDifferences function.
 * - SummarizeDataDifferencesOutput - The return type for the summarizeDataDifferences function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeDataDifferencesInputSchema = z.object({
  database1Name: z.string().describe('The name of the first database.'),
  database2Name: z.string().describe('The name of the second database.'),
  differences: z.string().describe('The data differences identified between the two databases.'),
});
export type SummarizeDataDifferencesInput = z.infer<typeof SummarizeDataDifferencesInputSchema>;

const SummarizeDataDifferencesOutputSchema = z.object({
  summary: z.string().describe('A summary of the data differences and their potential impact on data integrity.'),
  impactAssessment: z.string().describe('An assessment of the potential impact of the data differences on data integrity.'),
});
export type SummarizeDataDifferencesOutput = z.infer<typeof SummarizeDataDifferencesOutputSchema>;

export async function summarizeDataDifferences(input: SummarizeDataDifferencesInput): Promise<SummarizeDataDifferencesOutput> {
  return summarizeDataDifferencesFlow(input);
}

const summarizeDataDifferencesPrompt = ai.definePrompt({
  name: 'summarizeDataDifferencesPrompt',
  input: {schema: SummarizeDataDifferencesInputSchema},
  output: {schema: SummarizeDataDifferencesOutputSchema},
  prompt: `You are an expert data analyst tasked with summarizing the differences between two databases and assessing the potential impact on data integrity.

  You will receive the names of the two databases and a detailed list of the differences between them.

  Your goal is to provide a concise summary of the differences and a clear assessment of the potential impact on data integrity. Consider the severity and scope of the differences when assessing the impact.

  Database 1 Name: {{{database1Name}}}
  Database 2 Name: {{{database2Name}}}
  Data Differences: {{{differences}}}

  Summary:
  Impact Assessment: `,
});

const summarizeDataDifferencesFlow = ai.defineFlow(
  {
    name: 'summarizeDataDifferencesFlow',
    inputSchema: SummarizeDataDifferencesInputSchema,
    outputSchema: SummarizeDataDifferencesOutputSchema,
  },
  async input => {
    const {output} = await summarizeDataDifferencesPrompt(input);
    return output!;
  }
);
