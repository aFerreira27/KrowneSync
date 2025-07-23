
'use client';

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { Auth, getAuth, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Singleton pattern to ensure single instance
let app: FirebaseApp;
let auth: Auth;

function initializeFirebase() {
  if (typeof window === 'undefined') {
    return;
  }
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
    auth = initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence]
    });
  } else {
    app = getApp();
    // getAuth() retrieves the existing instance associated with the app
    auth = getAuth(app);
  }
}

// Initialize on first load
initializeFirebase();

export function getFirebaseApp() {
  if (typeof window === 'undefined') return null;
  if (!app) initializeFirebase();
  return app;
}

export function getFirebaseAuth() {
  if (typeof window === 'undefined') return null;
  if (!auth) initializeFirebase();
  return auth;
}
