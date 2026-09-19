const CATALOG_DATE_FORMATTER = new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
});

const UNKNOWN_DATE_LABEL = 'Data non nota';
const ALL_WATCHED_LABEL = 'In pari';
const ALL_SHOWS_CAUGHT_UP_SUMMARY = 'Siete in pari con tutto';
const NO_BACKLOG_HEADLINE = 'Nessuna puntata arretrata.';
const NEVER_REFRESHED_LABEL = 'non ancora aggiornata';
const JUST_REFRESHED_LABEL = 'aggiornata ora';
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function formatCatalogDate(catalogDate: string | undefined): string {
    if (catalogDate === undefined) {
        return UNKNOWN_DATE_LABEL;
    }
    const localDate = parseCatalogDateAsLocalDate(catalogDate);
    return CATALOG_DATE_FORMATTER.format(localDate);
}

export function formatUnwatchedCountLabel(unwatchedCount: number): string {
    if (unwatchedCount <= 0) {
        return ALL_WATCHED_LABEL;
    }
    const episodeNoun = unwatchedCount === 1 ? 'nuova' : 'nuove';
    return `${unwatchedCount} ${episodeNoun}`;
}

export function formatNewEpisodesSummary(newEpisodesCount: number, showsWithNewEpisodesCount: number): string {
    if (newEpisodesCount <= 0) {
        return ALL_SHOWS_CAUGHT_UP_SUMMARY;
    }
    const episodeNoun = newEpisodesCount === 1 ? 'nuova puntata' : 'nuove puntate';
    return `${newEpisodesCount} ${episodeNoun} in ${showsWithNewEpisodesCount} serie`;
}

export function formatEpisodeCode(seasonNumber: number, episodeNumber: number): string {
    const season = String(seasonNumber).padStart(2, '0');
    const episode = String(episodeNumber).padStart(2, '0');
    return `S${season} E${episode}`;
}

export function formatEpisodeHeadline(seasonNumber: number, episodeNumber: number, episodeTitle: string): string {
    return `${formatEpisodeCode(seasonNumber, episodeNumber)} · ${episodeTitle}`;
}

export function formatUpcomingEpisodeLabel(
    seasonNumber: number,
    episodeNumber: number,
    airDate: string | undefined
): string {
    return `Prossima puntata: ${formatEpisodeCode(seasonNumber, episodeNumber)} · ${formatCatalogDate(airDate)}`;
}

export function formatProviderLabel(providerName: string | undefined): string | undefined {
    return providerName === undefined ? undefined : `${providerName} · Italia`;
}

export function formatBacklogHeadline(backlogCount: number): string {
    if (backlogCount <= 0) {
        return NO_BACKLOG_HEADLINE;
    }
    const episodeNoun = backlogCount === 1 ? 'puntata pubblicata' : 'puntate pubblicate';
    return `${backlogCount} ${episodeNoun} da vedere.`;
}

export function formatLastRefreshLabel(lastCheckedAt: string | undefined, now: string): string {
    if (lastCheckedAt === undefined) {
        return NEVER_REFRESHED_LABEL;
    }
    const elapsedMs = new Date(now).getTime() - new Date(lastCheckedAt).getTime();
    return formatElapsedRefreshLabel(elapsedMs);
}

function formatElapsedRefreshLabel(elapsedMs: number): string {
    if (elapsedMs < MINUTE_MS) {
        return JUST_REFRESHED_LABEL;
    }
    if (elapsedMs < HOUR_MS) {
        return formatElapsedUnitLabel(Math.floor(elapsedMs / MINUTE_MS), 'minuto', 'minuti');
    }
    if (elapsedMs < DAY_MS) {
        return formatElapsedUnitLabel(Math.floor(elapsedMs / HOUR_MS), 'ora', 'ore');
    }
    return formatElapsedUnitLabel(Math.floor(elapsedMs / DAY_MS), 'giorno', 'giorni');
}

function formatElapsedUnitLabel(count: number, singular: string, plural: string): string {
    const unit = count === 1 ? singular : plural;
    return `aggiornata ${count} ${unit} fa`;
}

function parseCatalogDateAsLocalDate(catalogDate: string): Date {
    const [yearText, monthText, dayText] = catalogDate.split('-');
    return new Date(Number(yearText), Number(monthText) - 1, Number(dayText));
}
