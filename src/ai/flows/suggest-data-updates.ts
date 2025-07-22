
'use server';

/**
 * @fileOverview A flow that suggests data updates based on identified discrepancies.
 *
 * - suggestDataUpdates - A function that suggests data updates based on discrepancies.
 * - SuggestDataUpdatesInput - The input type for the suggestDataUpdates function.
 * - SuggestDataUpdatesOutput - The return type for the suggestDataUpdates function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestDataUpdatesInputSchema = z.object({
  platformA: z.string().describe('The name of the first platform being compared.'),
  platformB: z.string().describe('The name of the second platform being compared.'),
  discrepancies: z.string().describe('The identified data discrepancies between the two platforms.'),
  correctProductInformation: z.string().describe('The correct product information to use as a basis for updates.'),
});
export type SuggestDataUpdatesInput = z.infer<typeof SuggestDataUpdatesInputSchema>;

const SuggestDataUpdatesOutputSchema = z.object({
  suggestedUpdates: z.string().describe('The suggested data updates to resolve the discrepancies, formatted as a list of key-value pairs.'),
  reasoning: z.string().describe('The reasoning behind the suggested updates.'),
});
export type SuggestDataUpdatesOutput = z.infer<typeof SuggestDataUpdatesOutputSchema>;

export async function suggestDataUpdates(input: SuggestDataUpdatesInput): Promise<SuggestDataUpdatesOutput> {
  return suggestDataUpdatesFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestDataUpdatesPrompt',
  input: {schema: SuggestDataUpdatesInputSchema},
  output: {schema: SuggestDataUpdatesOutputSchema},
  prompt: `You are an expert data analyst specializing in identifying and correcting data discrepancies between different platforms.

You will be provided with the names of two platforms, a list of discrepancies between them, and the correct product information.

Your task is to analyze the discrepancies and suggest updates to resolve them, using the correct product information as a guide.

Platform A: {{{platformA}}}
Platform B: {{{platformB}}}
Discrepancies: {{{discrepancies}}}
Correct Product Information: {{{correctProductInformation}}}

Suggest updates to resolve the discrepancies, formatted as a list of key-value pairs, and provide reasoning for each suggested update. Focus on actionable changes, and making updates to Platform A to align it to Platform B. Return the list of suggested updates and the reasoning behind them.

If the provided data is insufficient or invalid, return an error message in the 'reasoning' field and leave 'suggestedUpdates' empty.

Make sure to provide a response in a format that can be easily parsed by a machine.

OUTPUT:
`, config: { safetySettings: [
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_ONLY_HIGH',
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_NONE',
        },
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_LOW_AND_ABOVE',
        },
      ],
    },
});

const suggestDataUpdatesFlow = ai.defineFlow(
  {
    name: 'suggestDataUpdatesFlow',
    inputSchema: SuggestDataUpdatesInputSchema,
    outputSchema: SuggestDataUpdatesOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
