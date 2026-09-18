export function runIgnoringStorageFailure<T>(operation: () => T, fallback: T): T {
    try {
        return operation();
    } catch {
        return fallback;
    }
}
