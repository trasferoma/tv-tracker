import { ref, type Ref } from 'vue';

import { type ActiveProfileStorage, browserActiveProfileStorage } from './activeProfileStorage';
import type { CredentialCheck, CredentialCheckOutcome } from './credentialCheck';
import { localCredentialCheck } from './localCredentialCheck';
import { findProfileById, type UserProfile } from './profiles';

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

export const session = createSession(localCredentialCheck, browserActiveProfileStorage);
