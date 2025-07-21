
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { summarizeDataDifferences } from '@/ai/flows/summarize-data-differences';
import { suggestDataUpdates } from '@/ai/flows/suggest-data-updates';

const loginSchema = z.object({
  token: z.string().min(1, 'Token is required.'),
});

// Mock user data
const MOCK_VALID_TOKEN = 'sync-me-in-42';
const AUTH_TOKEN_KEY = 'auth_token';

export async function login(prevState: any, formData: FormData) {
  const validatedFields = loginSchema.safeParse({
    token: formData.get('token'),
  });

  if (!validatedFields.success) {
    return {
      error: 'A valid token is required.',
    };
  }
  
  if (validatedFields.data.token !== MOCK_VALID_TOKEN) {
    return {
      error: 'Invalid token. Please use the correct token to login.',
    };
  }

  cookies().set(AUTH_TOKEN_KEY, validatedFields.data.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24, // 1 day
    path: '/',
  });

  redirect('/dashboard');
}

export async function logout() {
  cookies().delete(AUTH_TOKEN_KEY);
  redirect('/');
}

export async function getUser() {
  const token = cookies().get(AUTH_TOKEN_KEY)?.value;
  if (token === MOCK_VALID_TOKEN) {
    return { name: 'Demo User', email: 'user@synchromatic.com', initials: 'DU' };
  }
  return null;
}


const syncSchema = z.object({
  platformAData: z.string().min(10, "Platform A data must not be empty."),
  platformBData: z.string().min(10, "Platform B data must not be empty."),
});

export async function getSyncData(prevState: any, formData: FormData) {
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
