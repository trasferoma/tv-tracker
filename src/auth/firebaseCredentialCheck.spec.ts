import { FirebaseError } from 'firebase/app';
import type { Auth, UserCredential } from 'firebase/auth';
import { describe, expect, it, vi } from 'vitest';

import {
    createFirebaseCredentialCheck,
    findProfileIdForEmail,
    type FirebaseProfileEmails
} from './firebaseCredentialCheck';

const FAKE_AUTH = {} as Auth;
const FAKE_USER_CREDENTIAL = {} as UserCredential;

const CONFIGURED_EMAILS: FirebaseProfileEmails = {
    fabio: 'fabio@example.com',
    irene: 'irene@example.com'
};

function buildCredentialCheck(signIn: ReturnType<typeof vi.fn>, profileEmails: FirebaseProfileEmails = CONFIGURED_EMAILS) {
    return createFirebaseCredentialCheck(profileEmails, () => FAKE_AUTH, signIn);
}

describe('createFirebaseCredentialCheck', () => {
    it('rifiuta un profilo sconosciuto senza contattare Firebase', async () => {
        const signIn = vi.fn();
        const credentialCheck = buildCredentialCheck(signIn);

        const outcome = await credentialCheck.checkCredentials('mario', 'qualunque');

        expect(outcome).toEqual({ outcome: 'rejected', reason: 'Scegli Fabio oppure Irene.' });
        expect(signIn).not.toHaveBeenCalled();
    });

    it('rifiuta un profilo senza email configurata senza contattare Firebase', async () => {
        const signIn = vi.fn();
        const credentialCheck = buildCredentialCheck(signIn, { fabio: undefined, irene: 'irene@example.com' });

        const outcome = await credentialCheck.checkCredentials('fabio', 'qualunque');

        expect(outcome).toEqual({
            outcome: 'rejected',
            reason: 'Nessun account configurato per questo profilo. Avvisa chi gestisce l\'app.'
        });
        expect(signIn).not.toHaveBeenCalled();
    });

    it('autentica con l\'email del profilo scelto e restituisce quel profilo', async () => {
        const signIn = vi.fn().mockResolvedValue(FAKE_USER_CREDENTIAL);
        const credentialCheck = buildCredentialCheck(signIn);

        const outcome = await credentialCheck.checkCredentials('irene', 'password-vera');

        expect(signIn).toHaveBeenCalledWith(FAKE_AUTH, 'irene@example.com', 'password-vera');
        expect(outcome).toEqual({
            outcome: 'authenticated',
            profile: { id: 'irene', displayName: 'Irene', genderIcon: 'female' }
        });
    });

    it.each([
        ['auth/wrong-password', 'Password non corretta.'],
        ['auth/invalid-credential', 'Password non corretta.'],
        ['auth/user-not-found', 'Nessun account configurato per questo profilo. Avvisa chi gestisce l\'app.'],
        ['auth/too-many-requests', 'Troppi tentativi non riusciti. Attendi qualche minuto e riprova.'],
        ['auth/network-request-failed', 'Connessione assente: verifica la rete e riprova.'],
        ['auth/internal-error', 'Accesso non riuscito. Riprova.']
    ])('traduce l\'errore Firebase %s in un messaggio italiano comprensibile', async (code, reason) => {
        const signIn = vi.fn().mockRejectedValue(new FirebaseError(code, 'messaggio tecnico di Firebase'));
        const credentialCheck = buildCredentialCheck(signIn);

        const outcome = await credentialCheck.checkCredentials('fabio', 'password-sbagliata');

        expect(outcome).toEqual({ outcome: 'rejected', reason });
    });

    it('non lascia mai trapelare il codice tecnico dell\'errore Firebase nel messaggio', async () => {
        const signIn = vi.fn().mockRejectedValue(new FirebaseError('auth/wrong-password', 'messaggio tecnico'));
        const credentialCheck = buildCredentialCheck(signIn);

        const outcome = await credentialCheck.checkCredentials('fabio', 'password-sbagliata');

        if (outcome.outcome !== 'rejected') {
            throw new Error('esito inatteso: atteso un rifiuto');
        }
        expect(outcome.reason).not.toContain('auth/');
    });

    it('traduce un errore non riconducibile a Firebase in un messaggio generico', async () => {
        const signIn = vi.fn().mockRejectedValue(new Error('errore imprevisto'));
        const credentialCheck = buildCredentialCheck(signIn);

        const outcome = await credentialCheck.checkCredentials('fabio', 'qualunque');

        expect(outcome).toEqual({ outcome: 'rejected', reason: 'Accesso non riuscito. Riprova.' });
    });
});

describe('findProfileIdForEmail', () => {
    it('trova il profilo a partire dall\'email configurata, senza confondere fabio e irene', () => {
        expect(findProfileIdForEmail('fabio@example.com', CONFIGURED_EMAILS)).toBe('fabio');
        expect(findProfileIdForEmail('irene@example.com', CONFIGURED_EMAILS)).toBe('irene');
    });

    it('restituisce undefined per un\'email non riconosciuta', () => {
        expect(findProfileIdForEmail('sconosciuto@example.com', CONFIGURED_EMAILS)).toBeUndefined();
    });
});
