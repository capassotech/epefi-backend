// config/firebase.ts
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import path from "path";

let app;

if (getApps().length === 0) {
  // Opción 1: Usar archivo de credenciales (RECOMENDADO)
  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    app = initializeApp({
      credential: cert(path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)),
    });
  } else {
    // Opción 2: Usar variables de entorno (ACTUAL)
    app = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
} else {
  app = getApps()[0];
}

export const firebaseAuth = getAuth(app);
export const firestore = getFirestore(app);
export const db = firestore;
