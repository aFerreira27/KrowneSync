import * as admin from 'firebase-admin';
import { Auth } from 'firebase-admin/auth';

// This function ensures that we only initialize the Firebase Admin SDK once.
// It uses a lazy-initialization pattern to avoid issues with Next.js's build process.
const getFirebaseAuth = (): Auth => {
  if (!admin.apps.length) {
    // This configuration will use the service account credentials set in the environment
    // on Firebase App Hosting. For local development, you would set GOOGLE_APPLICATION_CREDENTIALS.
    admin.initializeApp();
  }
  return admin.auth();
};

export { getFirebaseAuth };
