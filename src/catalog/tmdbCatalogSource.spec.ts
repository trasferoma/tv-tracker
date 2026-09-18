import { afterEach, describe, expect, it, vi } from 'vitest';

import { tmdbCatalogSource } from './tmdbCatalogSource';

function jsonResponse(status: number, body: unknown): Response {
    const serializedBody = JSON.stringify(body);
    return new Response(serializedBody, { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('tmdbCatalogSource — rami di errore', () => {
    it('restituisce "missing" quando TMDB risponde 404 su loadShow', async () => {
        const notFoundResponse = jsonResponse(404, { status_message: 'not found' });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(notFoundResponse));

        const outcome = await tmdbCatalogSource.loadShow('id-inesistente');

        expect(outcome).toEqual({ outcome: 'missing' });
    });

    it('restituisce "unavailable" quando la rete non è raggiungibile', async () => {
        const networkError = new TypeError('network unreachable');
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkError));

        const outcome = await tmdbCatalogSource.searchShows('severance');

        expect(outcome).toMatchObject({ outcome: 'unavailable', reason: expect.stringContaining('connessione') });
    });

    it('restituisce "unavailable" con un messaggio dedicato quando TMDB risponde 429', async () => {
        const rateLimitedResponse = jsonResponse(429, {});
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rateLimitedResponse));

        const outcome = await tmdbCatalogSource.searchShows('severance');

        expect(outcome).toMatchObject({
            outcome: 'unavailable',
            reason: expect.stringContaining('limite di richieste')
        });
    });

    it('restituisce "unavailable" con un messaggio dedicato quando TMDB risponde con un errore 5xx', async () => {
        const serverErrorResponse = jsonResponse(503, {});
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(serverErrorResponse));

        const outcome = await tmdbCatalogSource.searchShows('severance');

        expect(outcome).toMatchObject({
            outcome: 'unavailable',
            reason: expect.stringContaining('non è al momento raggiungibile')
        });
    });

    it('distingue i messaggi fra rete assente, limite di richieste ed errore del server', async () => {
        const reasons: string[] = [];

        const offlineError = new TypeError('offline');
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(offlineError));
        reasons.push(await searchReason());

        const rateLimitedResponse = jsonResponse(429, {});
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rateLimitedResponse));
        reasons.push(await searchReason());

        const serverErrorResponse = jsonResponse(503, {});
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(serverErrorResponse));
        reasons.push(await searchReason());

        const distinctReasonCount = new Set(reasons).size;
        expect(distinctReasonCount).toBe(3);
    });

    it('non lascia trapelare l\'URL della richiesta nel messaggio di errore', async () => {
        const rateLimitedResponse = jsonResponse(429, {});
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rateLimitedResponse));

        const outcome = await tmdbCatalogSource.searchShows('severance');

        expect(outcome.outcome === 'unavailable' && outcome.reason).not.toMatch(/https?:\/\//);
    });
});

async function searchReason(): Promise<string> {
    const outcome = await tmdbCatalogSource.searchShows('severance');
    if (outcome.outcome !== 'unavailable') {
        throw new Error('il test si aspetta un esito "unavailable"');
    }
    return outcome.reason;
}
