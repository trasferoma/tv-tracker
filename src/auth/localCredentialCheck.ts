import type { CredentialCheck, CredentialCheckOutcome } from './credentialCheck';
import { findProfileById } from './profiles';

const UNKNOWN_PROFILE_REASON = 'Scegli Fabio oppure Irene.';
const WRONG_PASSWORD_REASON = 'Password non corretta.';

export function createLocalCredentialCheck(configuredPassword: string | undefined): CredentialCheck {
    function checkCredentials(profileId: string, password: string): Promise<CredentialCheckOutcome> {
        const outcome = resolveOutcome(profileId, password, configuredPassword);
        return Promise.resolve(outcome);
    }

    return { checkCredentials };
}

function resolveOutcome(
    profileId: string,
    password: string,
    configuredPassword: string | undefined
): CredentialCheckOutcome {
    const profile = findProfileById(profileId);
    if (profile === undefined) {
        return { outcome: 'rejected', reason: UNKNOWN_PROFILE_REASON };
    }
    // Controllo di cortesia, non prova di identità: chi conosce la password può scegliere
    // indifferentemente Fabio o Irene (SPEC § Accesso). Sparisce alla Fase 21 con Firebase Authentication.
    if (configuredPassword === undefined || password !== configuredPassword) {
        return { outcome: 'rejected', reason: WRONG_PASSWORD_REASON };
    }
    return { outcome: 'authenticated', profile };
}

export const localCredentialCheck: CredentialCheck = createLocalCredentialCheck(import.meta.env.VITE_LOCAL_PASSWORD);
