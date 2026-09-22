import { describe, expect, it } from 'vitest';

import type { ShowScope } from './showVisibility';
import { isVisibleToProfile, matchesScope, resolveShowAudience, withPrivateVisibility, withSharedVisibility } from './showVisibility';
import type { TrackedShow } from './trackedShow';

function buildShow(overrides: Partial<Pick<TrackedShow, 'visibility' | 'privateFor'>> = {}): TrackedShow {
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

describe('resolveShowAudience', () => {
    it('un record privo del campo di visibilità è trattato come condiviso (criterio 2)', () => {
        const show = buildShow();

        expect(resolveShowAudience(show)).toEqual({ kind: 'shared' });
    });

    it('privateFor presente su una serie "shared" viene ignorato e normalizzato a condivisa', () => {
        const show = buildShow({ visibility: 'shared', privateFor: 'fabio' });

        expect(resolveShowAudience(show)).toEqual({ kind: 'shared' });
    });

    it('una serie privata restituisce il profilo proprietario', () => {
        const show = buildShow({ visibility: 'private', privateFor: 'irene' });

        expect(resolveShowAudience(show)).toEqual({ kind: 'private', profileId: 'irene' });
    });

    it('"private" senza privateFor (invariante violata) è normalizzato a condivisa', () => {
        const orphanShow = buildShow({ visibility: 'private' });

        expect(resolveShowAudience(orphanShow)).toEqual({ kind: 'shared' });
    });
});

describe('withSharedVisibility e withPrivateVisibility', () => {
    it('withPrivateVisibility valorizza visibility e privateFor', () => {
        const show = buildShow();

        const result = withPrivateVisibility(show, 'fabio');

        expect(result.visibility).toBe('private');
        expect(result.privateFor).toBe('fabio');
    });

    it('withSharedVisibility azzera privateFor anche partendo da una serie privata', () => {
        const privateShow = buildShow({ visibility: 'private', privateFor: 'fabio' });

        const result = withSharedVisibility(privateShow);

        expect(result.visibility).toBe('shared');
        expect(result.privateFor).toBeUndefined();
    });

    it('non muta la serie ricevuta', () => {
        const show = buildShow();

        withPrivateVisibility(show, 'fabio');

        expect(show.visibility).toBeUndefined();
        expect(show.privateFor).toBeUndefined();
    });
});

describe('isVisibleToProfile', () => {
    it('una serie condivisa è visibile a chiunque', () => {
        const show = buildShow();

        expect(isVisibleToProfile(show, 'fabio')).toBe(true);
        expect(isVisibleToProfile(show, 'irene')).toBe(true);
    });

    it('una serie privata è visibile solo al profilo proprietario', () => {
        const show = buildShow({ visibility: 'private', privateFor: 'fabio' });

        expect(isVisibleToProfile(show, 'fabio')).toBe(true);
        expect(isVisibleToProfile(show, 'irene')).toBe(false);
    });
});

describe('matchesScope', () => {
    it('con la lente "Tutto" superano il filtro sia le serie condivise sia le mie private', () => {
        const sharedShow = buildShow();
        const myPrivateShow = buildShow({ visibility: 'private', privateFor: 'fabio' });

        expect(matchesScope(sharedShow, 'fabio', 'all')).toBe(true);
        expect(matchesScope(myPrivateShow, 'fabio', 'all')).toBe(true);
    });

    it('con la lente "Solo le mie" le serie condivise sono escluse', () => {
        const sharedShow = buildShow();

        expect(matchesScope(sharedShow, 'fabio', 'mine')).toBe(false);
    });

    it('con la lente "Solo le mie" le mie serie private superano il filtro', () => {
        const myPrivateShow = buildShow({ visibility: 'private', privateFor: 'fabio' });

        expect(matchesScope(myPrivateShow, 'fabio', 'mine')).toBe(true);
    });

    it('la serie privata dell\'altra persona è esclusa con entrambe le posizioni della lente, anche senza pre-filtrare sul visibile', () => {
        const otherPersonPrivateShow = buildShow({ visibility: 'private', privateFor: 'fabio' });
        const scopes: readonly ShowScope[] = ['all', 'mine'];

        for (const scope of scopes) {
            expect(matchesScope(otherPersonPrivateShow, 'irene', scope)).toBe(false);
        }
    });
});

describe('visibilità e lente combinate (criterio 3)', () => {
    it('con la lente "Tutto" sono visibili sia le mie private sia le condivise', () => {
        const myPrivateShow = buildShow({ visibility: 'private', privateFor: 'fabio' });
        const sharedShow = buildShow();

        expect(matchesScope(myPrivateShow, 'fabio', 'all')).toBe(true);
        expect(matchesScope(sharedShow, 'fabio', 'all')).toBe(true);
    });

    it('con la lente "Solo le mie" sono visibili solo le mie serie private', () => {
        const myPrivateShow = buildShow({ visibility: 'private', privateFor: 'fabio' });
        const sharedShow = buildShow();

        expect(matchesScope(myPrivateShow, 'fabio', 'mine')).toBe(true);
        expect(matchesScope(sharedShow, 'fabio', 'mine')).toBe(false);
    });

    it('una serie privata dell\'altra persona non è visibile con nessuna posizione della lente', () => {
        const otherPersonPrivateShow = buildShow({ visibility: 'private', privateFor: 'fabio' });
        const viewerProfileId = 'irene';
        const scopes: readonly ShowScope[] = ['all', 'mine'];

        for (const scope of scopes) {
            expect(matchesScope(otherPersonPrivateShow, viewerProfileId, scope)).toBe(false);
        }
    });
});
