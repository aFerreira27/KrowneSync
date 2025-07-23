
'use client';

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// This function ensures that we only initialize the Firebase app once.
function getClientSideFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) {
    return getApp();
  }
  return initializeApp(firebaseConfig);
}

// This function ensures that we only initialize Firebase Auth once.
function getClientSideFirebaseAuth(): Auth {
  const app = getClientSideFirebaseApp();
  // getAuth() will return the existing instance, or create one if it doesn't exist.
  // We use initializeAuth here to be explicit about persistence.
  try {
     return getAuth(app);
  } catch (error) {
    // If getAuth throws (e.g., in some environments or due to multiple calls),
    // we use initializeAuth which is more robust for setting persistence.
    return initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence]
    });
  }
}

export function getFirebaseApp() {
  // Return null on the server
  if (typeof window === 'undefined') {
    return null;
  }
  return getClientSideFirebaseApp();
}

export function getFirebaseAuth() {
  // Return null on the server
  if (typeof window === 'undefined') {
    return null;
  }
  return getClientSideFirebaseAuth();
}
