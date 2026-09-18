import { describe, expect, it } from 'vitest';

import {
    buildProxyRequestUrl,
    buildSearchShowsRequest,
    buildSeasonDetailRequest,
    buildShowDetailRequest,
    buildWatchProvidersRequest,
    resolveTmdbTargetPath
} from './tmdbRequest';

function targetPathFor(proxyUrl: string): string | undefined {
    const incomingUrl = new URL(proxyUrl, 'http://localhost');
    return resolveTmdbTargetPath(incomingUrl.searchParams);
}

describe('resolveTmdbTargetPath — le quattro chiamate ammesse', () => {
    it('accetta la ricerca costruita da buildSearchShowsRequest', () => {
        const searchRequest = buildSearchShowsRequest('severance');
        const proxyUrl = buildProxyRequestUrl(searchRequest);
        const targetPath = targetPathFor(proxyUrl);

        expect(targetPath).toBe('/3/search/tv?query=severance&language=it-IT');
    });

    it('accetta il dettaglio serie costruito da buildShowDetailRequest', () => {
        const showDetailRequest = buildShowDetailRequest('95396');
        const proxyUrl = buildProxyRequestUrl(showDetailRequest);
        const targetPath = targetPathFor(proxyUrl);

        expect(targetPath).toBe('/3/tv/95396?language=it-IT');
    });

    it('accetta il dettaglio stagione costruito da buildSeasonDetailRequest', () => {
        const seasonDetailRequest = buildSeasonDetailRequest('95396', 2);
        const proxyUrl = buildProxyRequestUrl(seasonDetailRequest);
        const targetPath = targetPathFor(proxyUrl);

        expect(targetPath).toBe('/3/tv/95396/season/2?language=it-IT');
    });

    it('accetta i watch providers costruiti da buildWatchProvidersRequest', () => {
        const watchProvidersRequest = buildWatchProvidersRequest('95396');
        const proxyUrl = buildProxyRequestUrl(watchProvidersRequest);
        const targetPath = targetPathFor(proxyUrl);

        expect(targetPath).toBe('/3/tv/95396/watch/providers');
    });

    it('accetta la stagione 0 degli speciali', () => {
        const specialSeasonRequest = buildSeasonDetailRequest('95396', 0);
        const proxyUrl = buildProxyRequestUrl(specialSeasonRequest);
        const targetPath = targetPathFor(proxyUrl);

        expect(targetPath).toBe('/3/tv/95396/season/0?language=it-IT');
    });
});

describe('resolveTmdbTargetPath — rifiuta tutto ciò che non è nell\'elenco chiuso', () => {
    it('rifiuta un path assente', () => {
        const rejected = targetPathFor('/api/tmdb?language=it-IT');

        expect(rejected).toBeUndefined();
    });

    it('rifiuta un path vuoto', () => {
        const rejected = targetPathFor('/api/tmdb?path=&language=it-IT');

        expect(rejected).toBeUndefined();
    });

    it('rifiuta un tentativo di risalita con "..", e non lo fa comunque puntare fuori da /3', () => {
        const rejected = targetPathFor('/api/tmdb?path=../account&language=it-IT');

        expect(rejected).toBeUndefined();
    });

    it('rifiuta un path che inizia con "/", che punterebbe fuori dal segmento di versione', () => {
        const rejected = targetPathFor('/api/tmdb?path=/account&language=it-IT');

        expect(rejected).toBeUndefined();
    });

    it('rifiuta un path con doppio slash iniziale', () => {
        const rejected = targetPathFor('/api/tmdb?path=//evil.example.com&language=it-IT');

        expect(rejected).toBeUndefined();
    });

    it('rifiuta una risalita nascosta dentro una rotta altrimenti valida', () => {
        const rejected = targetPathFor('/api/tmdb?path=tv/95396/../../account&language=it-IT');

        expect(rejected).toBeUndefined();
    });

    it('rifiuta un endpoint TMDB reale ma non fra i quattro previsti', () => {
        const rejected = targetPathFor('/api/tmdb?path=account&language=it-IT');

        expect(rejected).toBeUndefined();
    });

    it('rifiuta un providerShowId non numerico', () => {
        const rejected = targetPathFor('/api/tmdb?path=tv/95396%3Bdrop&language=it-IT');

        expect(rejected).toBeUndefined();
    });

    it('rifiuta un parametro aggiuntivo non previsto dalla rotta', () => {
        const rejected = targetPathFor('/api/tmdb?path=tv/95396&language=it-IT&api_key=stolen');

        expect(rejected).toBeUndefined();
    });

    it('rifiuta la richiesta di watch providers se arriva con parametri extra', () => {
        const rejected = targetPathFor('/api/tmdb?path=tv/95396/watch/providers&language=it-IT');

        expect(rejected).toBeUndefined();
    });

    it('rifiuta un parametro mancante rispetto a quelli richiesti dalla rotta', () => {
        const rejected = targetPathFor('/api/tmdb?path=search/tv&query=severance');

        expect(rejected).toBeUndefined();
    });
});
