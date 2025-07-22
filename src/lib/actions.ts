
'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { summarizeDataDifferences } from '@/ai/flows/summarize-data-differences';
import { suggestDataUpdates } from '@/ai/flows/suggest-data-updates';
import { getFirebaseAuth, getFirestore } from '@/lib/firebase-admin';

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

    const auth = getFirebaseAuth();
    // Verify the ID token using Firebase Admin SDK to ensure the request is from an authenticated user.
    const decodedToken = await auth.verifyIdToken(idToken);
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
    
    // Return the specific error message if available, otherwise a generic one.
    const errorMessage = e.message || 'An unexpected server error occurred. Please try again.';
    return {
      error: errorMessage,
    };
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
