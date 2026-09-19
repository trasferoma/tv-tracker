import { onAuthStateChanged, signOut, type Auth, type User } from 'firebase/auth';
import { ref, type Ref } from 'vue';

import { type ActiveProfileStorage, browserActiveProfileStorage } from './activeProfileStorage';
import type { CredentialCheck, CredentialCheckOutcome } from './credentialCheck';
import { getFirebaseAuth } from './firebaseApp';
import {
    findProfileIdForEmail,
    firebaseCredentialCheck,
    firebaseProfileEmails,
    type FirebaseProfileEmails
} from './firebaseCredentialCheck';
import { localCredentialCheck } from './localCredentialCheck';
import { findProfileById, type UserProfile } from './profiles';
import { isLocalMode } from '@/localMode';

export type SessionState =
    | { readonly status: 'restoring' }
    | { readonly status: 'authenticated'; readonly profile: UserProfile }
    | { readonly status: 'anonymous' };

export interface SessionStateMatcher<T> {
    restoring(): T;
    authenticated(profile: UserProfile): T;
    anonymous(): T;
}

export function matchSessionState<T>(state: SessionState, matcher: SessionStateMatcher<T>): T {
    switch (state.status) {
        case 'restoring':
            return matcher.restoring();
        case 'authenticated':
            return matcher.authenticated(state.profile);
        case 'anonymous':
            return matcher.anonymous();
    }
}

export interface Session {
    readonly state: Ref<SessionState>;
    login(profileId: string, password: string): Promise<CredentialCheckOutcome>;
    logout(): void;
}

export function createSession(credentialCheck: CredentialCheck, storage: ActiveProfileStorage): Session {
    const state = ref<SessionState>({ status: 'restoring' });
    void restoreSessionState(storage).then((restoredState) => {
        state.value = restoredState;
    });

    async function login(profileId: string, password: string): Promise<CredentialCheckOutcome> {
        const outcome = await credentialCheck.checkCredentials(profileId, password);
        if (outcome.outcome === 'authenticated') {
            state.value = { status: 'authenticated', profile: outcome.profile };
            storage.save(outcome.profile.id);
        }
        return outcome;
    }

    function logout(): void {
        state.value = { status: 'anonymous' };
        storage.clear();
    }

    return { state, login, logout };
}

function restoreSessionState(storage: ActiveProfileStorage): Promise<SessionState> {
    return Promise.resolve(resolveSessionState(storage));
}

function resolveSessionState(storage: ActiveProfileStorage): SessionState {
    const savedProfileId = storage.load();
    if (savedProfileId === undefined) {
        return { status: 'anonymous' };
    }
    const profile = findProfileById(savedProfileId);
    if (profile === undefined) {
        return { status: 'anonymous' };
    }
    return { status: 'authenticated', profile };
}

interface FirebaseAuthRuntime {
    getAuth(): Auth;
    onAuthStateChanged(auth: Auth, callback: (user: User | null) => void): () => void;
    signOut(auth: Auth): Promise<void>;
}

const defaultFirebaseAuthRuntime: FirebaseAuthRuntime = {
    getAuth: getFirebaseAuth,
    onAuthStateChanged,
    signOut
};

export function createFirebaseSession(
    credentialCheck: CredentialCheck,
    authRuntime: FirebaseAuthRuntime = defaultFirebaseAuthRuntime,
    profileEmails: FirebaseProfileEmails = firebaseProfileEmails
): Session {
    const auth = authRuntime.getAuth();
    const state = ref<SessionState>({ status: 'restoring' });
    restoreFirebaseSessionState(authRuntime, auth, profileEmails, (restoredState) => {
        state.value = restoredState;
    });

    async function login(profileId: string, password: string): Promise<CredentialCheckOutcome> {
        const outcome = await credentialCheck.checkCredentials(profileId, password);
        if (outcome.outcome === 'authenticated') {
            state.value = { status: 'authenticated', profile: outcome.profile };
        }
        return outcome;
    }

    function logout(): void {
        state.value = { status: 'anonymous' };
        void authRuntime.signOut(auth).catch(() => undefined);
    }

    return { state, login, logout };
}

function restoreFirebaseSessionState(
    authRuntime: FirebaseAuthRuntime,
    auth: Auth,
    profileEmails: FirebaseProfileEmails,
    onRestored: (state: SessionState) => void
): void {
    const subscription: { unsubscribe: (() => void) | undefined } = { unsubscribe: undefined };
    subscription.unsubscribe = authRuntime.onAuthStateChanged(auth, (user) => {
        subscription.unsubscribe?.();
        onRestored(resolveFirebaseSessionState(user, profileEmails));
    });
}

function resolveFirebaseSessionState(user: User | null, profileEmails: FirebaseProfileEmails): SessionState {
    if (user === null || user.email === null) {
        return { status: 'anonymous' };
    }
    const profileId = findProfileIdForEmail(user.email, profileEmails);
    if (profileId === undefined) {
        return { status: 'anonymous' };
    }
    const profile = findProfileById(profileId);
    if (profile === undefined) {
        return { status: 'anonymous' };
    }
    return { status: 'authenticated', profile };
}

export const session: Session = isLocalMode
    ? createSession(localCredentialCheck, browserActiveProfileStorage)
    : createFirebaseSession(firebaseCredentialCheck);
