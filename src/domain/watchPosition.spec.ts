import { describe, expect, it } from 'vitest';

import type { Episode, Season, TrackedShow } from './trackedShow';
import { calculateWatchPosition } from './watchPosition';

function buildEpisode(seasonNumber: number, episodeNumber: number, airDate?: string): Episode {
    return {
        providerEpisodeId: `s${seasonNumber}e${episodeNumber}`,
        seasonNumber,
        episodeNumber,
        title: `S${seasonNumber}E${episodeNumber}`,
        airDate
    };
}

function buildSeason(seasonNumber: number, episodes: readonly Episode[]): Season {
    return {
        providerSeasonId: `season-${seasonNumber}`,
        seasonNumber,
        episodes
    };
}

function buildShow(seasons: readonly Season[], lastWatchedEpisodeId?: string): TrackedShow {
    return {
        id: 'show-1',
        catalogProvider: 'tmdb',
        providerShowId: 'tmdb-1',
        title: 'Serie di prova',
        status: 'In corso',
        seasons,
        italianProviders: [],
        lastWatchedEpisodeId,
        progressRevision: 0,
        addedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z'
    };
}

describe('calculateWatchPosition', () => {
    it('trova la prima puntata pubblicata non vista e conta gli arretrati (criterio 3)', () => {
        const episode1 = buildEpisode(1, 1, '2026-01-01');
        const episode2 = buildEpisode(1, 2, '2026-01-08');
        const episode3 = buildEpisode(1, 3, '2026-01-15');
        const season1 = buildSeason(1, [episode1, episode2, episode3]);
        const show = buildShow([season1], 's1e1');

        const position = calculateWatchPosition(show, '2026-02-01');

        expect(position.firstUnwatchedEpisode?.providerEpisodeId).toBe('s1e2');
        expect(position.backlogCount).toBe(2);
        expect(position.isCaughtUp).toBe(false);
    });

    it('alza il conteggio degli arretrati senza spostare la posizione quando una puntata viene pubblicata dopo l\'ultimo aggiornamento (criterio 8)', () => {
        const episode1 = buildEpisode(1, 1, '2026-01-01');
        const episode2 = buildEpisode(1, 2, '2026-01-08');
        const episode3 = buildEpisode(1, 3, '2026-01-15');
        const season1 = buildSeason(1, [episode1, episode2, episode3]);
        const show = buildShow([season1], 's1e1');

        const beforeThirdEpisodeAired = calculateWatchPosition(show, '2026-01-10');
        const afterThirdEpisodeAired = calculateWatchPosition(show, '2026-02-01');

        expect(beforeThirdEpisodeAired.backlogCount).toBe(1);
        expect(afterThirdEpisodeAired.backlogCount).toBe(2);
        expect(beforeThirdEpisodeAired.firstUnwatchedEpisode?.providerEpisodeId).toBe('s1e2');
        expect(afterThirdEpisodeAired.firstUnwatchedEpisode?.providerEpisodeId).toBe('s1e2');
    });

    it('serie mai iniziata: la prima puntata da vedere è il primo episodio della sequenza', () => {
        const episode1 = buildEpisode(1, 1, '2026-01-01');
        const episode2 = buildEpisode(1, 2, '2026-01-08');
        const season1 = buildSeason(1, [episode1, episode2]);
        const show = buildShow([season1]);

        const position = calculateWatchPosition(show, '2026-02-01');

        expect(position.nextUnwatchedEpisode?.providerEpisodeId).toBe('s1e1');
        expect(position.firstUnwatchedEpisode?.providerEpisodeId).toBe('s1e1');
        expect(position.backlogCount).toBe(2);
    });

    it('non conta come arretrato un episodio senza airDate, ma lo mantiene come episodio successivo grezzo', () => {
        const episode1 = buildEpisode(1, 1, '2026-01-01');
        const episode2 = buildEpisode(1, 2);
        const episode3 = buildEpisode(1, 3, '2026-01-15');
        const season1 = buildSeason(1, [episode1, episode2, episode3]);
        const show = buildShow([season1], 's1e1');

        const position = calculateWatchPosition(show, '2026-02-01');

        expect(position.nextUnwatchedEpisode?.providerEpisodeId).toBe('s1e2');
        expect(position.firstUnwatchedEpisode?.providerEpisodeId).toBe('s1e3');
        expect(position.backlogCount).toBe(1);
    });

    it('è in pari quando resta soltanto una puntata futura nota', () => {
        const episode1 = buildEpisode(1, 1, '2026-01-01');
        const episode2 = buildEpisode(1, 2, '2026-03-01');
        const season1 = buildSeason(1, [episode1, episode2]);
        const show = buildShow([season1], 's1e1');

        const position = calculateWatchPosition(show, '2026-02-01');

        expect(position.isCaughtUp).toBe(true);
        expect(position.backlogCount).toBe(0);
        expect(position.firstUnwatchedEpisode).toBeUndefined();
        expect(position.nextUpcomingEpisode?.providerEpisodeId).toBe('s1e2');
        expect(position.nextUnwatchedEpisode?.providerEpisodeId).toBe('s1e2');
    });

    it('considera pubblicata, non futura, una puntata la cui data di uscita coincide con oggi', () => {
        const episode1 = buildEpisode(1, 1, '2026-01-01');
        const episode2 = buildEpisode(1, 2, '2026-02-01');
        const season1 = buildSeason(1, [episode1, episode2]);
        const show = buildShow([season1], 's1e1');

        const position = calculateWatchPosition(show, '2026-02-01');

        expect(position.backlogCount).toBe(1);
        expect(position.firstUnwatchedEpisode?.providerEpisodeId).toBe('s1e2');
        expect(position.nextUpcomingEpisode).toBeUndefined();
    });

    it('esclude gli speciali dalla posizione e dal conteggio degli arretrati', () => {
        const special1 = buildEpisode(0, 1, '2026-01-01');
        const special2 = buildEpisode(0, 2, '2026-01-01');
        const specials = buildSeason(0, [special1, special2]);
        const episode1 = buildEpisode(1, 1, '2026-01-01');
        const season1 = buildSeason(1, [episode1]);
        const show = buildShow([specials, season1]);

        const position = calculateWatchPosition(show, '2026-02-01');

        expect(position.backlogCount).toBe(1);
        expect(position.firstUnwatchedEpisode?.seasonNumber).toBe(1);
    });

    it('è completata quando non resta alcun episodio non visto, né pubblicato né in arrivo', () => {
        const episode1 = buildEpisode(1, 1, '2026-01-01');
        const episode2 = buildEpisode(1, 2, '2026-01-08');
        const season1 = buildSeason(1, [episode1, episode2]);
        const show = buildShow([season1], 's1e2');

        const position = calculateWatchPosition(show, '2026-02-01');

        expect(position.isCompleted).toBe(true);
    });

    it('non è completata quando resta una puntata futura annunciata, anche se già in pari con gli arretrati', () => {
        const episode1 = buildEpisode(1, 1, '2026-01-01');
        const episode2 = buildEpisode(1, 2, '2026-03-01');
        const season1 = buildSeason(1, [episode1, episode2]);
        const show = buildShow([season1], 's1e1');

        const position = calculateWatchPosition(show, '2026-02-01');

        expect(position.isCaughtUp).toBe(true);
        expect(position.isCompleted).toBe(false);
    });

    it('non è completata una serie mai iniziata', () => {
        const episode1 = buildEpisode(1, 1, '2026-01-01');
        const episode2 = buildEpisode(1, 2, '2026-01-08');
        const season1 = buildSeason(1, [episode1, episode2]);
        const show = buildShow([season1]);

        const position = calculateWatchPosition(show, '2026-02-01');

        expect(position.isCompleted).toBe(false);
    });

    it('segnala come anomalia un lastWatchedEpisodeId assente dalla sequenza, senza trattarlo come serie mai iniziata', () => {
        const episode1 = buildEpisode(1, 1, '2026-01-01');
        const episode2 = buildEpisode(1, 2, '2026-01-08');
        const season1 = buildSeason(1, [episode1, episode2]);
        const show = buildShow([season1], 'episodio-rimosso-dal-catalogo');

        expect(() => calculateWatchPosition(show, '2026-02-01')).toThrow(
            /Serie di prova.*episodio-rimosso-dal-catalogo/
        );
    });
});
