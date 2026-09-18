import { describe, expect, it } from 'vitest';

import { createLocalCredentialCheck } from './localCredentialCheck';

const CONFIGURED_PASSWORD = 'segreto-di-test';

describe('createLocalCredentialCheck', () => {
    it('rifiuta un profilo sconosciuto', async () => {
        const credentialCheck = createLocalCredentialCheck(CONFIGURED_PASSWORD);

        const outcome = await credentialCheck.checkCredentials('mario', CONFIGURED_PASSWORD);

        expect(outcome).toEqual({ outcome: 'rejected', reason: 'Scegli Fabio oppure Irene.' });
    });

    it('rifiuta un id che differisce dal profilo solo per maiuscole', async () => {
        const credentialCheck = createLocalCredentialCheck(CONFIGURED_PASSWORD);

        const outcome = await credentialCheck.checkCredentials('Fabio', CONFIGURED_PASSWORD);

        expect(outcome).toEqual({ outcome: 'rejected', reason: 'Scegli Fabio oppure Irene.' });
    });

    it('rifiuta la password errata con un messaggio in italiano', async () => {
        const credentialCheck = createLocalCredentialCheck(CONFIGURED_PASSWORD);

        const outcome = await credentialCheck.checkCredentials('fabio', 'password-sbagliata');

        expect(outcome).toEqual({ outcome: 'rejected', reason: 'Password non corretta.' });
    });

    it('autentica e restituisce il profilo con la password corretta', async () => {
        const credentialCheck = createLocalCredentialCheck(CONFIGURED_PASSWORD);

        const outcome = await credentialCheck.checkCredentials('irene', CONFIGURED_PASSWORD);

        expect(outcome).toEqual({
            outcome: 'authenticated',
            profile: { id: 'irene', displayName: 'Irene', genderIcon: 'female' }
        });
    });

    it('accetta indifferentemente Fabio o Irene con la stessa password: è un controllo di cortesia', async () => {
        const credentialCheck = createLocalCredentialCheck(CONFIGURED_PASSWORD);

        const fabioOutcome = await credentialCheck.checkCredentials('fabio', CONFIGURED_PASSWORD);
        const ireneOutcome = await credentialCheck.checkCredentials('irene', CONFIGURED_PASSWORD);

        expect(fabioOutcome.outcome).toBe('authenticated');
        expect(ireneOutcome.outcome).toBe('authenticated');
    });

    it('rifiuta qualunque password quando non ne è configurata una', async () => {
        const credentialCheck = createLocalCredentialCheck(undefined);

        const outcome = await credentialCheck.checkCredentials('fabio', 'qualunque-cosa');

        expect(outcome.outcome).toBe('rejected');
    });
});
