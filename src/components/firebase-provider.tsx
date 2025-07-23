
'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getFirebaseApp, getFirebaseAuth } from '@/lib/firebase-client';
import type { Auth, User } from 'firebase/auth';

type FirebaseContextType = {
  app: ReturnType<typeof getFirebaseApp> | null;
  auth: Auth | null;
  user: User | null;
  loading: boolean;
};

const FirebaseContext = createContext<FirebaseContextType>({
  app: null,
  auth: null,
  user: null,
  loading: true,
});

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const [app, setApp] = useState<ReturnType<typeof getFirebaseApp> | null>(null);
  const [auth, setAuth] = useState<Auth | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const firebaseApp = getFirebaseApp();
    const firebaseAuth = getFirebaseAuth();
    setApp(firebaseApp);
    setAuth(firebaseAuth);

    const unsubscribe = firebaseAuth.onAuthStateChanged((user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <FirebaseContext.Provider value={{ app, auth, user, loading }}>
      {children}
    </FirebaseContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within a FirebaseProvider');
  }
  return context;
};
