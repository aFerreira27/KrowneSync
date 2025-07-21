import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  // This configuration will use the service account credentials set in the environment
  // on Firebase App Hosting. For local development, you would set GOOGLE_APPLICATION_CREDENTIALS.
  admin.initializeApp();
}

const auth = admin.auth();
export { auth };
