
'use client';

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp;
let auth: Auth;

function getFirebaseApp() {
  if (typeof window === 'undefined') {
    return null; 
  }

  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }
  return app;
}

function getFirebaseAuth() {
  if (typeof window === 'undefined') {
    // This is a placeholder for the server, it should not be used for auth operations.
    return null;
  }
  
  const app = getFirebaseApp();
  if (!app) {
     return null;
  }
  
  if (!auth) {
    // Use initializeAuth with persistence to solve cross-origin issues in dev
    auth = initializeAuth(app, {
        persistence: [indexedDBLocalPersistence, browserLocalPersistence]
    });
  }
  return auth;
}

export { getFirebaseApp, getFirebaseAuth };
