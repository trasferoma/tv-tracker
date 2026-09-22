import { describe, expect, it } from 'vitest';

import { isHiddenShow, resolveShowListing, withHiddenShow, withListedShow } from './showListing';
import type { TrackedShow } from './trackedShow';

function buildShow(
    overrides: Partial<
        Pick<
            TrackedShow,
            | 'hidden'
            | 'lastWatchedEpisodeId'
            | 'progressRevision'
            | 'visibility'
            | 'privateFor'
            | 'selectedStreamingProviderId'
        >
    > = {}
): TrackedShow {
    return {
        id: 'show-1',
        catalogProvider: 'tmdb',
        providerShowId: 'tmdb-1',
        title: 'Serie di prova',
        status: 'In corso',
        seasons: [],
        italianProviders: [],
        progressRevision: 0,
        addedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        ...overrides
    };
}

describe('resolveShowListing', () => {
    it('un record privo del campo è trattato come in elenco (criterio 1)', () => {
        const show = buildShow();

        expect(resolveShowListing(show)).toBe('listed');
    });

    it('hidden true è letto come nascosta', () => {
        const show = buildShow({ hidden: true });

        expect(resolveShowListing(show)).toBe('hidden');
    });

    it('hidden false è letto come in elenco', () => {
        const show = buildShow({ hidden: false });

        expect(resolveShowListing(show)).toBe('listed');
    });
});

describe('isHiddenShow', () => {
    it('è vero solo per le serie nascoste', () => {
        expect(isHiddenShow(buildShow())).toBe(false);
        expect(isHiddenShow(buildShow({ hidden: true }))).toBe(true);
    });
});

describe('withHiddenShow e withListedShow', () => {
    it('withHiddenShow scrive hidden a true', () => {
        const show = buildShow();

        const result = withHiddenShow(show);

        expect(result.hidden).toBe(true);
    });

    it('withListedShow toglie il campo invece di scrivere false', () => {
        const hiddenShow = buildShow({ hidden: true });

        const result = withListedShow(hiddenShow);

        expect(result.hidden).toBeUndefined();
    });

    it('withListedShow normalizza anche una serie con hidden: false, senza lasciare false', () => {
        const showWithFalse = buildShow({ hidden: false });

        const result = withListedShow(showWithFalse);

        expect(result.hidden).toBeUndefined();
    });

    it('i costruttori non alterano posizione, revisione, visibilità e piattaforma', () => {
        const show = buildShow({
            lastWatchedEpisodeId: 'ep-1',
            progressRevision: 3,
            visibility: 'private',
            privateFor: 'fabio',
            selectedStreamingProviderId: 'netflix'
        });

        const hidden = withHiddenShow(show);
        const listed = withListedShow(hidden);

        expect(hidden.lastWatchedEpisodeId).toBe('ep-1');
        expect(hidden.progressRevision).toBe(3);
        expect(hidden.visibility).toBe('private');
        expect(hidden.privateFor).toBe('fabio');
        expect(hidden.selectedStreamingProviderId).toBe('netflix');

        expect(listed.lastWatchedEpisodeId).toBe('ep-1');
        expect(listed.progressRevision).toBe(3);
        expect(listed.visibility).toBe('private');
        expect(listed.privateFor).toBe('fabio');
        expect(listed.selectedStreamingProviderId).toBe('netflix');
    });

    it('non muta la serie ricevuta', () => {
        const show = buildShow();

        withHiddenShow(show);

        expect(show.hidden).toBeUndefined();
    });
});
