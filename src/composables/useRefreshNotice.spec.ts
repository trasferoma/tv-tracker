import { describe, expect, it } from 'vitest';

import { createRefreshNotice } from './useRefreshNotice';

describe('useRefreshNotice', () => {
    it('non ha nessun messaggio prima di una richiesta di aggiornamento', () => {
        const notice = createRefreshNotice();

        expect(notice.message.value).toBeUndefined();
    });

    it('imposta l\'avviso di aggiornamento non disponibile quando viene richiesto un aggiornamento', () => {
        const notice = createRefreshNotice();

        notice.requestRefresh();

        expect(notice.message.value).toBe('Aggiornamento dalla rete non ancora disponibile.');
    });

    it('svuota il messaggio quando viene dismesso', () => {
        const notice = createRefreshNotice();
        notice.requestRefresh();

        notice.dismiss();

        expect(notice.message.value).toBeUndefined();
    });
});
