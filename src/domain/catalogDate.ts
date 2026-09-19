const CATALOG_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidCatalogDate(value: string): boolean {
    if (!CATALOG_DATE_PATTERN.test(value)) {
        return false;
    }
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    const parsedDate = new Date(year, month - 1, day);
    return parsedDate.getFullYear() === year && parsedDate.getMonth() === month - 1 && parsedDate.getDate() === day;
}

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
