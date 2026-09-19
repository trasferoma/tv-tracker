import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

interface FirebaseConfig {
    readonly apiKey: string;
    readonly authDomain: string;
    readonly projectId: string;
    readonly appId: string;
}

let cachedAuth: Auth | undefined;

export function getFirebaseAuth(): Auth {
    if (cachedAuth === undefined) {
        cachedAuth = getAuth(initializeFirebaseApp());
    }
    return cachedAuth;
}

function initializeFirebaseApp(): FirebaseApp {
    return initializeApp(readFirebaseConfig());
}

function readFirebaseConfig(): FirebaseConfig {
    const apiKey = requireFirebaseConfigValue('VITE_FIREBASE_API_KEY', import.meta.env.VITE_FIREBASE_API_KEY);
    const authDomain = requireFirebaseConfigValue('VITE_FIREBASE_AUTH_DOMAIN', import.meta.env.VITE_FIREBASE_AUTH_DOMAIN);
    const projectId = requireFirebaseConfigValue('VITE_FIREBASE_PROJECT_ID', import.meta.env.VITE_FIREBASE_PROJECT_ID);
    const appId = requireFirebaseConfigValue('VITE_FIREBASE_APP_ID', import.meta.env.VITE_FIREBASE_APP_ID);
    return { apiKey, authDomain, projectId, appId };
}

function requireFirebaseConfigValue(variableName: string, value: string | undefined): string {
    if (value === undefined || value.length === 0) {
        throw new Error(`Configurazione Firebase mancante: imposta ${variableName} in .env.local.`);
    }
    return value;
}
