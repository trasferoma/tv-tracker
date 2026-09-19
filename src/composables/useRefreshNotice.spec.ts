import { computed, ref } from 'vue';
import { describe, expect, it } from 'vitest';

import { createRefreshNotice } from './useRefreshNotice';
import type { CatalogRefreshOutcome, UseCatalogRefresh } from './useCatalogRefresh';

function buildCatalogRefresh(refreshManually: () => Promise<CatalogRefreshOutcome>): UseCatalogRefresh {
    return {
        isRefreshing: ref(false),
        lastCheckedLabel: computed(() => 'aggiornata ora'),
        refreshManually,
        checkBackgroundRefresh: () => Promise.resolve()
    };
}

describe('useRefreshNotice', () => {
    it('non ha nessun messaggio prima di una richiesta di aggiornamento', () => {
        const notice = createRefreshNotice(buildCatalogRefresh(() => Promise.resolve({ outcome: 'updated' })));

        expect(notice.message.value).toBeUndefined();
    });

    it('mostra un messaggio di successo quando l\'aggiornamento manuale riesce (parla sempre)', async () => {
        const notice = createRefreshNotice(buildCatalogRefresh(() => Promise.resolve({ outcome: 'updated' })));

        await notice.requestRefresh();

        expect(notice.message.value).toBe('Serie aggiornate dalla rete.');
    });

    it('mostra il motivo del fallimento quando l\'aggiornamento manuale non riesce (parla sempre)', async () => {
        const reason = 'Impossibile contattare TMDB: verifica la connessione di rete.';
        const notice = createRefreshNotice(buildCatalogRefresh(() => Promise.resolve({ outcome: 'unavailable', reason })));

        await notice.requestRefresh();

        expect(notice.message.value).toBe(reason);
    });

    it('mostra un messaggio dedicato quando non ci sono serie da aggiornare', async () => {
        const notice = createRefreshNotice(buildCatalogRefresh(() => Promise.resolve({ outcome: 'noShows' })));

        await notice.requestRefresh();

        expect(notice.message.value).toBe('Nessuna serie da aggiornare.');
    });

    it('svuota il messaggio quando viene dismesso', async () => {
        const notice = createRefreshNotice(buildCatalogRefresh(() => Promise.resolve({ outcome: 'updated' })));
        await notice.requestRefresh();

        notice.dismiss();

        expect(notice.message.value).toBeUndefined();
    });
});
