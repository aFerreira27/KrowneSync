'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { summarizeDataDifferences } from '@/ai/flows/summarize-data-differences';
import { suggestDataUpdates } from '@/ai/flows/suggest-data-updates';
import { auth as adminAuth } from '@/lib/firebase-admin';

export async function logout() {
  // Client-side will handle the redirect upon auth state change.
  // This function can remain for server-side logout logic if needed in the future.
  redirect('/');
}

const syncSchema = z.object({
  platformAData: z.string().min(10, "Platform A data must not be empty."),
  platformBData: z.string().min(10, "Platform B data must not be empty."),
  idToken: z.string().min(1, "Authentication token is missing."),
});

export async function getSyncData(prevState: any, formData: FormData) {
  try {
    const validatedFields = syncSchema.safeParse({
      platformAData: formData.get('platformAData'),
      platformBData: formData.get('platformBData'),
      idToken: formData.get('idToken'),
    });

    if (!validatedFields.success) {
      return {
        error: validatedFields.error.flatten().fieldErrors,
      };
    }
    
    const { platformAData, platformBData, idToken } = validatedFields.data;

    // Verify the ID token using Firebase Admin SDK to ensure the request is from an authenticated user.
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;
    console.log("Authenticated user UID:", uid);

    // In a real app, you would use the `uid` to perform user-specific operations.

    const differences = `Platform A: ${platformAData} | Platform B: ${platformBData}`;
    
    const summaryResult = await summarizeDataDifferences({
        database1Name: 'Platform A',
        database2Name: 'Platform B',
        differences: differences,
    });

    const suggestionsResult = await suggestDataUpdates({
        platformA: 'Platform A',
        platformB: 'Platform B',
        discrepancies: summaryResult.summary,
        correctProductInformation: platformBData,
    });

    return {
      summary: summaryResult.summary,
      impact: summaryResult.impactAssessment,
      suggestions: suggestionsResult.suggestedUpdates,
      reasoning: suggestionsResult.reasoning,
    };
  } catch (e: any) {
    console.error("Error verifying ID token or processing data:", e);
    // Handle specific Firebase Admin errors if needed
    if (e.code === 'auth/id-token-expired') {
        return { error: 'Your session has expired. Please sign in again.' };
    }
    return {
      error: 'Authentication failed or an unexpected error occurred. Please try again.',
    };
  }
}
