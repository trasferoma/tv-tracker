import type { Ref } from 'vue';

import type { CredentialCheckOutcome } from '@/auth/credentialCheck';
import { matchSessionState, session, type SessionState } from '@/auth/session';

export { matchSessionState };
export type { SessionState };

export interface AuthSession {
    readonly state: Ref<SessionState>;
    login(profileId: string, password: string): Promise<CredentialCheckOutcome>;
    logout(): void;
}

export function useAuthSession(): AuthSession {
    return session;
}
