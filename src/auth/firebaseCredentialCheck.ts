import { FirebaseError } from 'firebase/app';
import { signInWithEmailAndPassword, type Auth } from 'firebase/auth';

import type { CredentialCheck, CredentialCheckOutcome } from './credentialCheck';
import { getFirebaseAuth } from './firebaseApp';
import { findProfileById, type UserProfile } from './profiles';

const UNKNOWN_PROFILE_REASON = 'Scegli Fabio oppure Irene.';
const WRONG_PASSWORD_REASON = 'Password non corretta.';
const ACCOUNT_NOT_CONFIGURED_REASON = 'Nessun account configurato per questo profilo. Avvisa chi gestisce l\'app.';
const TOO_MANY_ATTEMPTS_REASON = 'Troppi tentativi non riusciti. Attendi qualche minuto e riprova.';
const NETWORK_ERROR_REASON = 'Connessione assente: verifica la rete e riprova.';
const GENERIC_ERROR_REASON = 'Accesso non riuscito. Riprova.';

type SignInWithEmailAndPassword = typeof signInWithEmailAndPassword;

export interface FirebaseProfileEmails {
    readonly fabio: string | undefined;
    readonly irene: string | undefined;
}

export const firebaseProfileEmails: FirebaseProfileEmails = {
    fabio: import.meta.env.VITE_FIREBASE_FABIO_EMAIL,
    irene: import.meta.env.VITE_FIREBASE_IRENE_EMAIL
};

export function findProfileIdForEmail(email: string, profileEmails: FirebaseProfileEmails): string | undefined {
    if (email === profileEmails.fabio) {
        return 'fabio';
    }
    if (email === profileEmails.irene) {
        return 'irene';
    }
    return undefined;
}

function findEmailForProfileId(profileId: string, profileEmails: FirebaseProfileEmails): string | undefined {
    if (profileId === 'fabio') {
        return profileEmails.fabio;
    }
    if (profileId === 'irene') {
        return profileEmails.irene;
    }
    return undefined;
}

export function createFirebaseCredentialCheck(
    profileEmails: FirebaseProfileEmails,
    getAuthInstance: () => Auth = getFirebaseAuth,
    signIn: SignInWithEmailAndPassword = signInWithEmailAndPassword
): CredentialCheck {
    function checkCredentials(profileId: string, password: string): Promise<CredentialCheckOutcome> {
        const profile = findProfileById(profileId);
        if (profile === undefined) {
            return Promise.resolve({ outcome: 'rejected', reason: UNKNOWN_PROFILE_REASON });
        }
        const email = findEmailForProfileId(profileId, profileEmails);
        if (email === undefined) {
            return Promise.resolve({ outcome: 'rejected', reason: ACCOUNT_NOT_CONFIGURED_REASON });
        }
        return attemptSignIn(getAuthInstance(), email, password, profile, signIn);
    }

    return { checkCredentials };
}

async function attemptSignIn(
    auth: Auth,
    email: string,
    password: string,
    profile: UserProfile,
    signIn: SignInWithEmailAndPassword
): Promise<CredentialCheckOutcome> {
    try {
        await signIn(auth, email, password);
        return { outcome: 'authenticated', profile };
    } catch (error) {
        return { outcome: 'rejected', reason: describeAuthError(error) };
    }
}

function describeAuthError(error: unknown): string {
    if (!(error instanceof FirebaseError)) {
        return GENERIC_ERROR_REASON;
    }
    switch (error.code) {
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            return WRONG_PASSWORD_REASON;
        case 'auth/user-not-found':
            return ACCOUNT_NOT_CONFIGURED_REASON;
        case 'auth/too-many-requests':
            return TOO_MANY_ATTEMPTS_REASON;
        case 'auth/network-request-failed':
            return NETWORK_ERROR_REASON;
        default:
            return GENERIC_ERROR_REASON;
    }
}

export const firebaseCredentialCheck: CredentialCheck = createFirebaseCredentialCheck(firebaseProfileEmails);
