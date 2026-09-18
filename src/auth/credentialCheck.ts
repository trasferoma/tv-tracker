import type { UserProfile } from './profiles';

export type CredentialCheckOutcome =
    | { readonly outcome: 'authenticated'; readonly profile: UserProfile }
    | { readonly outcome: 'rejected'; readonly reason: string };

export interface CredentialCheck {
    checkCredentials(profileId: string, password: string): Promise<CredentialCheckOutcome>;
}
