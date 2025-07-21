'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { summarizeDataDifferences } from '@/ai/flows/summarize-data-differences';
import { suggestDataUpdates } from '@/ai/flows/suggest-data-updates';
// Import Firebase Admin SDK
import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK (do this once in your application)
// Check if a Firebase app has already been initialized to avoid errors in development with hot-reloading
if (!admin.apps.length) {
  admin.initializeApp(); // Assumes you have set up Application Default Credentials
}

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
  // This function might not be needed in server actions if you verify token in each relevant action
  // However, if you need a central place to get user info from a token, you can adapt this.
  // For now, we will rely on token verification in individual actions like getSyncData.
  return null; // Or adapt to take token as argument and verify
}

const syncSchema = z.object({
  platformAData: z.string().min(10, "Platform A data must not be empty."),
  platformBData: z.string().min(10, "Platform B data must not be empty."),
  idToken: z.string().min(1, "Authentication token is missing."), // Add idToken to schema
});

export async function getSyncData(prevState: any, formData: FormData) {
  // In a real application, you would typically use the authenticated user's information
  // (e.g., UID) to fetch or process data relevant to that user.
  // For this example, we will keep the data processing logic as is,
  // but in a real scenario, you would incorporate user-specific data handling based on the UID.

  try {
    const validatedFields = syncSchema.safeParse({
      platformAData: formData.get('platformAData'),
      platformBData: formData.get('platformBData'),
      idToken: formData.get('idToken'), // Get idToken from formData
    });

    if (!validatedFields.success) {
      return {
        error: validatedFields.error.flatten().fieldErrors,
      };
    }
    
    const { platformAData, platformBData, idToken } = validatedFields.data; // Extract idToken

    // Verify the ID token using Firebase Admin SDK
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid; // Get the authenticated user's UID

    console.log("Authenticated user UID:", uid);

    // --- Start: User-specific data handling (Conceptual) ---
    // Now that you have the `uid`, you can use it to:
    // - Fetch user-specific data from your database
    // - Save/update data associated with this user
    // - Implement access control based on the user's identity
    // For this example, we'll just log the UID. Replace this with your actual logic.
    // --- End: User-specific data handling (Conceptual) ---

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
    console.error("Error verifying ID token or processing data:", e);
    // Handle errors (e.g., invalid token, expired token)
    return {
      error: 'Authentication failed or an unexpected error occurred. Please try again.',
    };
  }
}
