export function toCatalogDate(instant: Date): string {
    const year = instant.getFullYear();
    const month = String(instant.getMonth() + 1).padStart(2, '0');
    const day = String(instant.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function compareCatalogDates(a: string, b: string): number {
    if (a === b) {
        return 0;
    }
    return a < b ? -1 : 1;
}

export function isAlreadyPublished(airDate: string | undefined, today: string): boolean {
    if (airDate === undefined) {
        return false;
    }
    return compareCatalogDates(airDate, today) <= 0;
}
