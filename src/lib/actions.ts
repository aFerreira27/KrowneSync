'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { summarizeDataDifferences } from '@/ai/flows/summarize-data-differences';
import { suggestDataUpdates } from '@/ai/flows/suggest-data-updates';
import { getAuth } from 'firebase/auth';

// Mock user data - No longer needed
// const MOCK_VALID_TOKEN = 'sync-me-in-42';
// const AUTH_TOKEN_KEY = 'auth_token';

// login function is no longer needed as authentication is handled by Firebase on the client side
// export async function login(prevState: any, formData: FormData) { ... }

export async function logout() {
  // Firebase client-side logout will handle clearing the session
  // We might still need a server-side action if there are server-specific logout tasks
  // For now, we'll just redirect to the login page
  redirect('/');
}

export async function getUser() {
  // Get the authenticated user from Firebase Authentication on the server side
  // Note: Server-side access to Firebase Auth user requires careful setup
  // with Admin SDK or similar approach to verify tokens securely.
  // This is a simplified example and might need adjustments based on your setup.
  const auth = getAuth();
  const user = auth.currentUser; // This might not work directly in a server action context without proper setup

  if (user) {
    // Return relevant user data
    return {
      name: user.displayName || 'User',
      email: user.email || '',
      initials: user.displayName ? user.displayName.charAt(0) : 'U',
      uid: user.uid,
    };
  }
  return null;
}

const syncSchema = z.object({
  platformAData: z.string().min(10, "Platform A data must not be empty."),
  platformBData: z.string().min(10, "Platform B data must not be empty."),
});

export async function getSyncData(prevState: any, formData: FormData) {
  // In a real application, you would typically use the authenticated user's information
  // (e.g., UID) to fetch or process data relevant to that user.
  // For this example, we will keep the data processing logic as is,
  // but in a real scenario, you would incorporate user-specific data handling.

  try {
    const validatedFields = syncSchema.safeParse({
      platformAData: formData.get('platformAData'),
      platformBData: formData.get('platformBData'),
    });

    if (!validatedFields.success) {
      return {
        error: validatedFields.error.flatten().fieldErrors,
      };
    }
    
    const { platformAData, platformBData } = validatedFields.data;

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
  } catch (e) {
    console.error(e);
    return {
      error: 'An unexpected error occurred. Please try again.',
    };
  }
}
