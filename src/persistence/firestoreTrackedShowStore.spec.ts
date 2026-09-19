import { describe, expect, it } from 'vitest';

import { createFirestoreTrackedShowStore, type FirestoreRuntime } from './firestoreTrackedShowStore';
import type { Unsubscribe } from './trackedShowStore';
import type { Episode, ItalianProvider, Season, TrackedShow } from '@/domain/trackedShow';

const TODAY = '2026-02-01';
const TEST_HOUSEHOLD_ID = 'test-household';

function buildEpisode(seasonNumber: number, episodeNumber: number, airDate = '2026-01-01'): Episode {
    return {
        providerEpisodeId: `s${seasonNumber}e${episodeNumber}`,
        seasonNumber,
        episodeNumber,
        title: `S${seasonNumber}E${episodeNumber}`,
        airDate
    };
}

function buildSeason(seasonNumber: number, episodeCount: number): Season {
    const episodes = Array.from({ length: episodeCount }, (_, index) => buildEpisode(seasonNumber, index + 1));
    return { providerSeasonId: `season-${seasonNumber}`, seasonNumber, episodes };
}

function buildShow(overrides: Partial<TrackedShow> = {}): TrackedShow {
    const providers: readonly ItalianProvider[] = [{ id: 'netflix', name: 'Netflix' }];
    return {
        id: `show-${Math.random().toString(36).slice(2)}`,
        catalogProvider: 'tmdb',
        providerShowId: 'tmdb-1',
        title: 'Serie di prova',
        status: 'In corso',
        seasons: [buildSeason(1, 3)],
        italianProviders: providers,
        selectedStreamingProviderId: 'netflix',
        selectedStreamingProviderName: 'Netflix',
        progressRevision: 0,
        addedAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        ...overrides
    };
}

interface FakeRef {
    readonly id: string;
    readonly path: string;
}

interface FakeSnapshot {
    readonly id: string;
    readonly ref: FakeRef;
    exists(): boolean;
    data(): Record<string, unknown> | undefined;
}

interface FakeQuerySnapshot {
    readonly docs: readonly FakeSnapshot[];
    readonly empty: boolean;
    readonly size: number;
}

type FakeConstraint =
    | { readonly kind: 'where'; readonly field: string; readonly value: unknown }
    | { readonly kind: 'limit'; readonly count: number };

interface FakeQueryTarget {
    readonly path?: string;
    readonly collectionGroupId?: string;
    readonly constraints?: readonly FakeConstraint[];
}

const SERVER_TIMESTAMP_SENTINEL = Symbol('serverTimestamp');

function fakeTimestamp(date: Date): { toDate(): Date } {
    return { toDate: () => date };
}

function joinPath(path: string, pathSegments: readonly string[]): string {
    return [path, ...pathSegments].join('/');
}

function lastSegmentOf(path: string): string {
    const segments = path.split('/');
    return segments[segments.length - 1] ?? '';
}

function resolveWriteData(data: Record<string, unknown>, now: Date): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(data)) {
        if (value === undefined) {
            continue;
        }
        resolved[field] = value === SERVER_TIMESTAMP_SENTINEL ? fakeTimestamp(now) : value;
    }
    return resolved;
}

interface FakeFirestoreHandle {
    readonly runtime: FirestoreRuntime;
    readonly documents: Map<string, Record<string, unknown>>;
    transactionAttempts: number;
}

function createFakeFirestoreRuntime(): FakeFirestoreHandle {
    const documents = new Map<string, Record<string, unknown>>();
    const subscribers = new Set<() => void>();
    let transactionQueue: Promise<void> = Promise.resolve();
    const handle: FakeFirestoreHandle = { runtime: undefined as unknown as FirestoreRuntime, documents, transactionAttempts: 0 };

    function notifySubscribers(): void {
        subscribers.forEach((notify) => notify());
    }

    function refFor(path: string): FakeRef {
        return { id: lastSegmentOf(path), path };
    }

    function snapshotFor(ref: FakeRef): FakeSnapshot {
        const dataAtSnapshotTime = documents.get(ref.path);
        return {
            id: ref.id,
            ref,
            exists: () => dataAtSnapshotTime !== undefined,
            data: () => dataAtSnapshotTime
        };
    }

    function collectDirectChildren(collectionPath: string): readonly FakeSnapshot[] {
        const prefix = `${collectionPath}/`;
        const matches: FakeRef[] = [];
        documents.forEach((_data, path) => {
            if (path.startsWith(prefix) && !path.slice(prefix.length).includes('/')) {
                matches.push(refFor(path));
            }
        });
        return matches.map(snapshotFor);
    }

    function collectByCollectionGroup(collectionId: string): readonly FakeSnapshot[] {
        const matches: FakeRef[] = [];
        documents.forEach((_data, path) => {
            const segments = path.split('/');
            if (segments.length >= 2 && segments[segments.length - 2] === collectionId) {
                matches.push(refFor(path));
            }
        });
        return matches.map(snapshotFor);
    }

    function applyConstraints(docs: readonly FakeSnapshot[], constraints: readonly FakeConstraint[]): readonly FakeSnapshot[] {
        return constraints.reduce<readonly FakeSnapshot[]>((current, constraint) => {
            if (constraint.kind === 'where') {
                return current.filter((snapshot) => snapshot.data()?.[constraint.field] === constraint.value);
            }
            return current.slice(0, constraint.count);
        }, docs);
    }

    function resolveQuerySnapshot(target: FakeQueryTarget): FakeQuerySnapshot {
        const baseDocs = target.collectionGroupId !== undefined
            ? collectByCollectionGroup(target.collectionGroupId)
            : collectDirectChildren(target.path ?? '');
        const docs = applyConstraints(baseDocs, target.constraints ?? []);
        return { docs, empty: docs.length === 0, size: docs.length };
    }

    function writeDocument(ref: FakeRef, data: Record<string, unknown>): void {
        documents.set(ref.path, resolveWriteData(data, new Date()));
    }

    function updateDocument(ref: FakeRef, partial: Record<string, unknown>): void {
        const existing = documents.get(ref.path) ?? {};
        documents.set(ref.path, { ...existing, ...resolveWriteData(partial, new Date()) });
    }

    function deleteDocument(ref: FakeRef): void {
        documents.delete(ref.path);
    }

    function buildTransaction() {
        handle.transactionAttempts += 1;
        return {
            get: (reference: FakeRef) => Promise.resolve(snapshotFor(reference)),
            set: (reference: FakeRef, data: Record<string, unknown>) => writeDocument(reference, data),
            update: (reference: FakeRef, partial: Record<string, unknown>) => updateDocument(reference, partial),
            delete: (reference: FakeRef) => deleteDocument(reference)
        };
    }

    function buildBatch() {
        const operations: Array<() => void> = [];
        return {
            set: (reference: FakeRef, data: Record<string, unknown>) => {
                operations.push(() => writeDocument(reference, data));
            },
            delete: (reference: FakeRef) => {
                operations.push(() => deleteDocument(reference));
            },
            commit: () => {
                operations.forEach((operation) => operation());
                notifySubscribers();
                return Promise.resolve();
            }
        };
    }

    function subscribeToDocument(reference: FakeRef, onNext: (snapshot: FakeSnapshot) => void): Unsubscribe {
        const notify = () => onNext(snapshotFor(reference));
        subscribers.add(notify);
        notify();
        return () => subscribers.delete(notify);
    }

    function subscribeToQuery(target: FakeQueryTarget, onNext: (snapshot: FakeQuerySnapshot) => void): Unsubscribe {
        const notify = () => onNext(resolveQuerySnapshot(target));
        subscribers.add(notify);
        notify();
        return () => subscribers.delete(notify);
    }

    async function runTransaction<T>(_firestore: unknown, updateFunction: (transaction: ReturnType<typeof buildTransaction>) => Promise<T>): Promise<T> {
        const runAfterQueue = transactionQueue.then(async () => {
            const result = await updateFunction(buildTransaction());
            notifySubscribers();
            return result;
        });
        transactionQueue = runAfterQueue.then(() => undefined, () => undefined);
        return runAfterQueue;
    }

    const runtime = {
        getFirestore: () => undefined,
        getHouseholdId: () => TEST_HOUSEHOLD_ID,
        collection: (_firestore: unknown, path: string, ...pathSegments: string[]) => ({ path: joinPath(path, pathSegments) }),
        collectionGroup: (_firestore: unknown, collectionId: string) => ({ collectionGroupId: collectionId }),
        doc: (_firestore: unknown, path: string, ...pathSegments: string[]) => refFor(joinPath(path, pathSegments)),
        query: (target: FakeQueryTarget, ...constraints: readonly FakeConstraint[]) => ({ ...target, constraints }),
        where: (field: string, _opStr: string, value: unknown): FakeConstraint => ({ kind: 'where', field, value }),
        limit: (count: number): FakeConstraint => ({ kind: 'limit', count }),
        getDoc: (reference: FakeRef) => Promise.resolve(snapshotFor(reference)),
        getDocs: (target: FakeQueryTarget) => Promise.resolve(resolveQuerySnapshot(target)),
        setDoc: (reference: FakeRef, data: Record<string, unknown>) => {
            writeDocument(reference, data);
            notifySubscribers();
            return Promise.resolve();
        },
        subscribeToDocument,
        subscribeToQuery,
        runTransaction,
        writeBatch: () => buildBatch(),
        serverTimestamp: () => SERVER_TIMESTAMP_SENTINEL,
        timestampFromDate: (date: Date) => fakeTimestamp(date)
    } as unknown as FirestoreRuntime;

    return { ...handle, runtime };
}

function waitForCondition<T>(
    subscribe: (listener: (value: T) => void) => Unsubscribe,
    predicate: (value: T) => boolean
): Promise<T> {
    return new Promise((resolve) => {
        const unsubscribe = subscribe((value) => {
            if (predicate(value)) {
                unsubscribe();
                resolve(value);
            }
        });
    });
}

describe('firestoreTrackedShowStore', () => {
    describe('sottoscrizione', () => {
        it('riceve l\'avviso dopo una scrittura', async () => {
            const { runtime } = createFakeFirestoreRuntime();
            const store = createFirestoreTrackedShowStore(runtime);
            const show = buildShow();
            const notified = waitForCondition(
                (listener) => store.subscribeToTrackedShows(listener),
                (shows: readonly TrackedShow[]) => shows.some((candidate) => candidate.id === show.id)
            );

            await store.addShow(show);
            const shows = await notified;

            expect(shows).toHaveLength(1);
        });

        it('una sottoscrizione annullata non riceve più avvisi', async () => {
            const { runtime } = createFakeFirestoreRuntime();
            const store = createFirestoreTrackedShowStore(runtime);
            const receivedCounts: number[] = [];
            const unsubscribe = store.subscribeToTrackedShows((shows) => receivedCounts.push(shows.length));

            await store.addShow(buildShow());
            const countAfterFirstWrite = receivedCounts.length;
            unsubscribe();
            await store.addShow(buildShow({ providerShowId: 'tmdb-2' }));

            expect(receivedCounts.length).toBe(countAfterFirstWrite);
        });
    });

    describe('addShow', () => {
        it('rifiuta un duplicato per providerShowId', async () => {
            const { runtime, documents } = createFakeFirestoreRuntime();
            const store = createFirestoreTrackedShowStore(runtime);
            await store.addShow(buildShow({ providerShowId: 'tmdb-42' }));

            const outcome = await store.addShow(buildShow({ providerShowId: 'tmdb-42' }));

            expect(outcome.outcome).toBe('rejected');
            expect(documents.size).toBe(1);
        });
    });

    describe('updateCatalog', () => {
        it('aggiorna i dati editoriali della serie esistente', async () => {
            const { runtime } = createFakeFirestoreRuntime();
            const store = createFirestoreTrackedShowStore(runtime);
            const show = buildShow({ title: 'Titolo originale' });
            await store.addShow(show);

            const outcome = await store.updateCatalog({ ...show, title: 'Titolo aggiornato' });

            expect(outcome.outcome).toBe('updated');
            let latestShow: TrackedShow | undefined;
            const unsubscribe = store.subscribeToShow(show.id, (candidate) => {
                latestShow = candidate;
            });
            unsubscribe();
            expect(latestShow?.title).toBe('Titolo aggiornato');
        });

        it('rifiuta l\'aggiornamento di una serie non più presente', async () => {
            const { runtime } = createFakeFirestoreRuntime();
            const store = createFirestoreTrackedShowStore(runtime);

            const outcome = await store.updateCatalog(buildShow({ id: 'inesistente' }));

            expect(outcome.outcome).toBe('rejected');
        });
    });

    describe('changeProvider', () => {
        it('sostituisce la piattaforma selezionata mantenendo il resto della serie', async () => {
            const { runtime } = createFakeFirestoreRuntime();
            const store = createFirestoreTrackedShowStore(runtime);
            const show = buildShow();
            await store.addShow(show);
            const newProvider: ItalianProvider = { id: 'disneyplus', name: 'Disney+' };

            const outcome = await store.changeProvider(show.id, newProvider, '2026-02-02T00:00:00.000Z');

            expect(outcome.outcome).toBe('changed');
            let latestShow: TrackedShow | undefined;
            const unsubscribe = store.subscribeToShow(show.id, (candidate) => {
                latestShow = candidate;
            });
            unsubscribe();
            expect(latestShow?.selectedStreamingProviderId).toBe('disneyplus');
            expect(latestShow?.selectedStreamingProviderName).toBe('Disney+');
        });

        it('rifiuta il cambio piattaforma per una serie non più presente', async () => {
            const { runtime } = createFakeFirestoreRuntime();
            const store = createFirestoreTrackedShowStore(runtime);

            const outcome = await store.changeProvider('inesistente', undefined, '2026-02-02T00:00:00.000Z');

            expect(outcome.outcome).toBe('rejected');
        });
    });

    describe('removeShow', () => {
        it('elimina la serie e la sua sottocollezione di eventi', async () => {
            const { runtime, documents } = createFakeFirestoreRuntime();
            const store = createFirestoreTrackedShowStore(runtime);
            const show = buildShow();
            await store.addShow(show);
            await store.advanceProgress(show.id, 's1e1', 'fabio', TODAY);

            const outcome = await store.removeShow(show.id);

            expect(outcome.outcome).toBe('removed');
            const remainingPaths = [...documents.keys()];
            expect(remainingPaths.some((path) => path.includes(show.id))).toBe(false);
        });

        it('rifiuta la rimozione di una serie non più presente', async () => {
            const { runtime } = createFakeFirestoreRuntime();
            const store = createFirestoreTrackedShowStore(runtime);

            const outcome = await store.removeShow('inesistente');

            expect(outcome.outcome).toBe('rejected');
        });
    });

    describe('rilettura dello stato dentro la transazione — criterio 10', () => {
        it('due avanzamenti concorrenti non fanno regredire la posizione: prevale il più avanzato', async () => {
            const { runtime } = createFakeFirestoreRuntime();
            const store = createFirestoreTrackedShowStore(runtime);
            const show = buildShow({ seasons: [buildSeason(1, 3)] });
            await store.addShow(show);

            const [advanceToLast, advanceToMiddle] = await Promise.all([
                store.advanceProgress(show.id, 's1e3', 'fabio', TODAY),
                store.advanceProgress(show.id, 's1e2', 'irene', TODAY)
            ]);

            expect(advanceToLast.outcome).toBe('applied');
            expect(advanceToMiddle.outcome).toBe('rejected');
            let latestShow: TrackedShow | undefined;
            const unsubscribe = store.subscribeToShow(show.id, (candidate) => {
                latestShow = candidate;
            });
            unsubscribe();
            expect(latestShow?.lastWatchedEpisodeId).toBe('s1e3');
        });

        it('un undo obsoleto viene rifiutato perché la revisione attesa non è più quella corrente', async () => {
            const { runtime } = createFakeFirestoreRuntime();
            const store = createFirestoreTrackedShowStore(runtime);
            const show = buildShow();
            await store.addShow(show);
            await store.advanceProgress(show.id, 's1e1', 'fabio', TODAY);
            await store.advanceProgress(show.id, 's1e2', 'fabio', TODAY);
            const staleRevisionCapturedBeforeSecondAdvance = 1;

            const outcome = await store.undoLastProgress(show.id, staleRevisionCapturedBeforeSecondAdvance, 'irene');

            expect(outcome.outcome).toBe('rejected');
        });

        it('un undo concorrente a un avanzamento viene rifiutato sulla revisione fresca riletta in transazione', async () => {
            const { runtime } = createFakeFirestoreRuntime();
            const store = createFirestoreTrackedShowStore(runtime);
            const show = buildShow({ seasons: [buildSeason(1, 3)] });
            await store.addShow(show);
            await store.advanceProgress(show.id, 's1e1', 'fabio', TODAY);
            const revisionBeforeConcurrentAdvance = 1;

            const [advanceToNext, staleUndo] = await Promise.all([
                store.advanceProgress(show.id, 's1e2', 'fabio', TODAY),
                store.undoLastProgress(show.id, revisionBeforeConcurrentAdvance, 'irene')
            ]);

            expect(advanceToNext.outcome).toBe('applied');
            expect(staleUndo.outcome).toBe('rejected');
        });

        it('ripristina posizione ed evento quando la revisione è corretta', async () => {
            const { runtime } = createFakeFirestoreRuntime();
            const store = createFirestoreTrackedShowStore(runtime);
            const show = buildShow();
            await store.addShow(show);
            await store.advanceProgress(show.id, 's1e1', 'fabio', TODAY);

            const outcome = await store.undoLastProgress(show.id, 1, 'irene');

            expect(outcome.outcome).toBe('applied');
            if (outcome.outcome === 'applied') {
                expect(outcome.show.lastWatchedEpisodeId).toBeUndefined();
                expect(outcome.event.undoneBy).toBe('irene');
            }
        });
    });

    describe('listAllProgressEvents', () => {
        it('restituisce gli eventi di tutte le serie con un\'unica query di gruppo', async () => {
            const { runtime } = createFakeFirestoreRuntime();
            const store = createFirestoreTrackedShowStore(runtime);
            const first = buildShow({ providerShowId: 'tmdb-first' });
            const second = buildShow({ providerShowId: 'tmdb-second' });
            await store.addShow(first);
            await store.addShow(second);
            await store.advanceProgress(first.id, 's1e1', 'fabio', TODAY);
            await store.advanceProgress(second.id, 's1e1', 'irene', TODAY);

            const events = await store.listAllProgressEvents();

            expect(events.map((event) => event.trackedShowId).sort()).toEqual([first.id, second.id].sort());
        });
    });

    describe('replaceAllShows', () => {
        it('sostituisce tutte le serie e dichiara l\'esito pieno', async () => {
            const { runtime, documents } = createFakeFirestoreRuntime();
            const store = createFirestoreTrackedShowStore(runtime);
            const previous = buildShow({ providerShowId: 'tmdb-previous' });
            await store.addShow(previous);
            const replacement = buildShow({ providerShowId: 'tmdb-replacement' });

            const outcome = await store.replaceAllShows([replacement], []);

            expect(outcome).toEqual({ outcome: 'replaced' });
            const remainingShowIds = [...documents.keys()].filter((path) => path.endsWith(replacement.id));
            expect(remainingShowIds).toHaveLength(1);
        });

        it('dichiara un esito parziale, non pieno, quando la scrittura fallisce a metà', async () => {
            const { runtime } = createFakeFirestoreRuntime();
            const failingRuntime = {
                ...runtime,
                writeBatch: () => ({
                    set: () => undefined,
                    update: () => undefined,
                    delete: () => undefined,
                    commit: () => Promise.reject(new Error('errore simulato a metà scrittura'))
                })
            } as unknown as FirestoreRuntime;
            const store = createFirestoreTrackedShowStore(failingRuntime);

            const outcome = await store.replaceAllShows([buildShow()], []);

            expect(outcome.outcome).toBe('partial');
        });
    });
});
