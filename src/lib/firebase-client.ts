
'use client';

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { Auth, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

function getFirebaseApp() {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!app) {
    if (!getApps().length) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApp();
    }
  }
  return app;
}

function getFirebaseAuth() {
  if (typeof window === 'undefined') {
    return null;
  }
  
  const currentApp = getFirebaseApp();
  if (!currentApp) {
     return null;
  }
  
  if (!auth) {
    auth = initializeAuth(currentApp, {
        persistence: [indexedDBLocalPersistence, browserLocalPersistence]
    });
  }
  return auth;
}

export { getFirebaseApp, getFirebaseAuth };
