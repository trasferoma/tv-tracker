import {
    collection,
    collectionGroup,
    doc,
    getDoc,
    getDocs,
    initializeFirestore,
    limit,
    onSnapshot,
    persistentLocalCache,
    persistentMultipleTabManager,
    query,
    runTransaction,
    serverTimestamp,
    setDoc,
    Timestamp,
    where,
    writeBatch,
    type CollectionReference,
    type DocumentData,
    type DocumentReference,
    type DocumentSnapshot,
    type FieldValue,
    type Firestore,
    type Query,
    type QueryConstraint,
    type QueryDocumentSnapshot,
    type QuerySnapshot,
    type SnapshotOptions,
    type Transaction,
    type WhereFilterOp,
    type WriteBatch
} from 'firebase/firestore';

import type {
    AddShowOutcome,
    ChangeListingOutcome,
    ChangeProviderOutcome,
    ChangeVisibilityOutcome,
    RemoveShowOutcome,
    ReplaceAllShowsOutcome,
    TrackedShowListener,
    TrackedShowsListener,
    TrackedShowStore,
    Unsubscribe,
    UpdateCatalogOutcome
} from './trackedShowStore';
import { getFirebaseAuth } from '@/auth/firebaseApp';
import { advanceProgress as computeAdvance } from '@/domain/progressAdvance';
import { resetProgress as computeReset } from '@/domain/progressReset';
import { undoLastProgress as computeUndo } from '@/domain/progressUndo';
import { isHiddenShow, withHiddenShow, withListedShow, type ShowListing } from '@/domain/showListing';
import { resolveShowAudience, withPrivateVisibility, withSharedVisibility, type ShowAudience } from '@/domain/showVisibility';
import type {
    InitialPositionChoice,
    ItalianProvider,
    ProgressEvent,
    ProgressOutcome,
    ResetProgressOutcome,
    TrackedShow
} from '@/domain/trackedShow';

const HOUSEHOLDS_COLLECTION = 'households';
const TRACKED_SHOWS_COLLECTION = 'trackedShows';
const PROGRESS_EVENTS_COLLECTION = 'progressEvents';
const MAX_BATCH_WRITE_OPERATIONS = 400;

const SHOW_NOT_FOUND_REASON = 'La serie non esiste più: potrebbe essere stata rimossa da un altro dispositivo.';
const DUPLICATE_SHOW_REASON = 'Questa serie è già stata aggiunta.';
const DUPLICATE_HIDDEN_SHOW_REASON =
    'Questa serie è già stata aggiunta ed è nascosta dall\'elenco: puoi riportarla in elenco dal suo dettaglio.';
const VISIBILITY_COLLISION_REASONS: Record<ShowAudience['kind'], string> = {
    shared: 'Questa serie è già condivisa in una scheda a parte: rimuovine una prima di renderla condivisa.',
    private: 'Hai già una scheda solo tua di questa serie: rimuovila prima di rendere privata anche questa.'
};
const REPLACE_FAILURE_REASON = 'La sostituzione dei dati non è riuscita per intero: alcune serie potrebbero ' +
    'risultare mancanti o incomplete. Riprova; se il problema persiste verifica la connessione.';

const ESTIMATE_PENDING_SERVER_TIMESTAMPS: SnapshotOptions = { serverTimestamps: 'estimate' };

export interface FirestoreRuntime {
    getFirestore(): Firestore;
    getHouseholdId(): string;
    collection(firestore: Firestore, path: string, ...pathSegments: string[]): CollectionReference<DocumentData, DocumentData>;
    collectionGroup(firestore: Firestore, collectionId: string): Query<DocumentData, DocumentData>;
    doc(firestore: Firestore, path: string, ...pathSegments: string[]): DocumentReference<DocumentData, DocumentData>;
    query(target: Query<DocumentData, DocumentData>, ...constraints: readonly QueryConstraint[]): Query<DocumentData, DocumentData>;
    where(fieldPath: string, opStr: WhereFilterOp, value: unknown): QueryConstraint;
    limit(count: number): QueryConstraint;
    getDoc(reference: DocumentReference<DocumentData, DocumentData>): Promise<DocumentSnapshot<DocumentData, DocumentData>>;
    getDocs(target: Query<DocumentData, DocumentData>): Promise<QuerySnapshot<DocumentData, DocumentData>>;
    setDoc(reference: DocumentReference<DocumentData, DocumentData>, data: DocumentData): Promise<void>;
    subscribeToDocument(
        reference: DocumentReference<DocumentData, DocumentData>,
        onNext: (snapshot: DocumentSnapshot<DocumentData, DocumentData>) => void
    ): Unsubscribe;
    subscribeToQuery(
        target: Query<DocumentData, DocumentData>,
        onNext: (snapshot: QuerySnapshot<DocumentData, DocumentData>) => void
    ): Unsubscribe;
    runTransaction<T>(firestore: Firestore, updateFunction: (transaction: Transaction) => Promise<T>): Promise<T>;
    writeBatch(firestore: Firestore): WriteBatch;
    serverTimestamp(): FieldValue;
    timestampFromDate(date: Date): Timestamp;
}

type BatchOperation = (batch: WriteBatch) => void;

let cachedFirestore: Firestore | undefined;

function createFirestoreInstance(): Firestore {
    const app = getFirebaseAuth().app;
    return initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
        ignoreUndefinedProperties: true
    });
}

function resolveFirestoreInstance(): Firestore {
    if (cachedFirestore === undefined) {
        cachedFirestore = createFirestoreInstance();
    }
    return cachedFirestore;
}

function readHouseholdId(): string {
    const householdId: string | undefined = import.meta.env.VITE_FIREBASE_HOUSEHOLD_ID;
    if (householdId === undefined || householdId.length === 0) {
        throw new Error('Configurazione Firebase mancante: imposta VITE_FIREBASE_HOUSEHOLD_ID in .env.local.');
    }
    return householdId;
}

function subscribeToDocumentWithOnSnapshot(
    reference: DocumentReference<DocumentData, DocumentData>,
    onNext: (snapshot: DocumentSnapshot<DocumentData, DocumentData>) => void
): Unsubscribe {
    return onSnapshot(reference, onNext);
}

function subscribeToQueryWithOnSnapshot(
    target: Query<DocumentData, DocumentData>,
    onNext: (snapshot: QuerySnapshot<DocumentData, DocumentData>) => void
): Unsubscribe {
    return onSnapshot(target, onNext);
}

const defaultFirestoreRuntime: FirestoreRuntime = {
    getFirestore: resolveFirestoreInstance,
    getHouseholdId: readHouseholdId,
    collection,
    collectionGroup,
    doc,
    query,
    where,
    limit,
    getDoc,
    getDocs,
    setDoc,
    subscribeToDocument: subscribeToDocumentWithOnSnapshot,
    subscribeToQuery: subscribeToQueryWithOnSnapshot,
    runTransaction,
    writeBatch,
    serverTimestamp,
    timestampFromDate: (date) => Timestamp.fromDate(date)
};

function trackedShowsCollectionRef(runtime: FirestoreRuntime, firestore: Firestore): CollectionReference<DocumentData, DocumentData> {
    return runtime.collection(firestore, HOUSEHOLDS_COLLECTION, runtime.getHouseholdId(), TRACKED_SHOWS_COLLECTION);
}

function trackedShowDocRef(runtime: FirestoreRuntime, firestore: Firestore, id: string): DocumentReference<DocumentData, DocumentData> {
    return runtime.doc(firestore, HOUSEHOLDS_COLLECTION, runtime.getHouseholdId(), TRACKED_SHOWS_COLLECTION, id);
}

function progressEventsCollectionRef(
    runtime: FirestoreRuntime,
    firestore: Firestore,
    trackedShowId: string
): CollectionReference<DocumentData, DocumentData> {
    return runtime.collection(
        firestore,
        HOUSEHOLDS_COLLECTION,
        runtime.getHouseholdId(),
        TRACKED_SHOWS_COLLECTION,
        trackedShowId,
        PROGRESS_EVENTS_COLLECTION
    );
}

function progressEventDocRef(
    runtime: FirestoreRuntime,
    firestore: Firestore,
    trackedShowId: string,
    eventId: string
): DocumentReference<DocumentData, DocumentData> {
    return runtime.doc(
        firestore,
        HOUSEHOLDS_COLLECTION,
        runtime.getHouseholdId(),
        TRACKED_SHOWS_COLLECTION,
        trackedShowId,
        PROGRESS_EVENTS_COLLECTION,
        eventId
    );
}

function readTrackedShowSnapshot(snapshot: QueryDocumentSnapshot<DocumentData, DocumentData>): TrackedShow {
    return snapshot.data() as TrackedShow;
}

interface RawFirestoreProgressEvent {
    readonly id: string;
    readonly trackedShowId: string;
    readonly previousEpisodeId?: string;
    readonly confirmedEpisodeId: string;
    readonly seasonNumber: number;
    readonly episodeNumber: number;
    readonly episodeTitle: string;
    readonly confirmedAt: Timestamp;
    readonly confirmedBy: string;
    readonly undoneAt?: Timestamp;
    readonly undoneBy?: string;
}

function readProgressEventSnapshot(snapshot: QueryDocumentSnapshot<DocumentData, DocumentData>): ProgressEvent {
    const raw = snapshot.data(ESTIMATE_PENDING_SERVER_TIMESTAMPS) as RawFirestoreProgressEvent;
    return {
        id: raw.id,
        trackedShowId: raw.trackedShowId,
        previousEpisodeId: raw.previousEpisodeId,
        confirmedEpisodeId: raw.confirmedEpisodeId,
        seasonNumber: raw.seasonNumber,
        episodeNumber: raw.episodeNumber,
        episodeTitle: raw.episodeTitle,
        confirmedAt: raw.confirmedAt.toDate().toISOString(),
        confirmedBy: raw.confirmedBy,
        undoneAt: raw.undoneAt === undefined ? undefined : raw.undoneAt.toDate().toISOString(),
        undoneBy: raw.undoneBy
    };
}

function toFirestoreConfirmedEvent(runtime: FirestoreRuntime, event: ProgressEvent): DocumentData {
    return { ...event, confirmedAt: runtime.serverTimestamp() };
}

function toFirestoreImportedEvent(runtime: FirestoreRuntime, event: ProgressEvent): DocumentData {
    return {
        ...event,
        confirmedAt: runtime.timestampFromDate(new Date(event.confirmedAt)),
        undoneAt: event.undoneAt === undefined ? undefined : runtime.timestampFromDate(new Date(event.undoneAt))
    };
}

function readDeviceInstant(): string {
    return new Date().toISOString();
}

function subscribeToTrackedShows(runtime: FirestoreRuntime, listener: TrackedShowsListener): Unsubscribe {
    const firestore = runtime.getFirestore();
    return runtime.subscribeToQuery(trackedShowsCollectionRef(runtime, firestore), (snapshot) => {
        listener(snapshot.docs.map(readTrackedShowSnapshot));
    });
}

function subscribeToShow(runtime: FirestoreRuntime, id: string, listener: TrackedShowListener): Unsubscribe {
    const firestore = runtime.getFirestore();
    return runtime.subscribeToDocument(trackedShowDocRef(runtime, firestore, id), (snapshot) => {
        listener(snapshot.exists() ? readTrackedShowSnapshot(snapshot) : undefined);
    });
}

function audiencesCollide(first: ShowAudience, second: ShowAudience): boolean {
    if (first.kind === 'shared' && second.kind === 'shared') {
        return true;
    }
    return first.kind === 'private' && second.kind === 'private' && first.profileId === second.profileId;
}

async function findShowsByProviderShowId(
    runtime: FirestoreRuntime,
    firestore: Firestore,
    providerShowId: string
): Promise<readonly TrackedShow[]> {
    const providerShowQuery = runtime.query(
        trackedShowsCollectionRef(runtime, firestore),
        runtime.where('providerShowId', '==', providerShowId)
    );
    const snapshot = await runtime.getDocs(providerShowQuery);
    return snapshot.docs.map(readTrackedShowSnapshot);
}

async function findDuplicateForAudience(
    runtime: FirestoreRuntime,
    firestore: Firestore,
    providerShowId: string,
    targetAudience: ShowAudience
): Promise<TrackedShow | undefined> {
    const candidates = await findShowsByProviderShowId(runtime, firestore, providerShowId);
    return candidates.find((candidate) => audiencesCollide(resolveShowAudience(candidate), targetAudience));
}

async function addShow(runtime: FirestoreRuntime, show: TrackedShow): Promise<AddShowOutcome> {
    const firestore = runtime.getFirestore();
    const targetAudience = resolveShowAudience(show);
    const duplicate = await findDuplicateForAudience(runtime, firestore, show.providerShowId, targetAudience);
    if (duplicate !== undefined) {
        const reason = isHiddenShow(duplicate) ? DUPLICATE_HIDDEN_SHOW_REASON : DUPLICATE_SHOW_REASON;
        return { outcome: 'rejected', reason };
    }
    await runtime.setDoc(trackedShowDocRef(runtime, firestore, show.id), show);
    return { outcome: 'added' };
}

async function updateCatalog(runtime: FirestoreRuntime, show: TrackedShow): Promise<UpdateCatalogOutcome> {
    const firestore = runtime.getFirestore();
    const showRef = trackedShowDocRef(runtime, firestore, show.id);
    const existing = await runtime.getDoc(showRef);
    if (!existing.exists()) {
        return { outcome: 'rejected', reason: SHOW_NOT_FOUND_REASON };
    }
    await runtime.setDoc(showRef, show);
    return { outcome: 'updated' };
}

async function changeProvider(
    runtime: FirestoreRuntime,
    id: string,
    selectedProvider: ItalianProvider | undefined,
    updatedAt: string
): Promise<ChangeProviderOutcome> {
    const firestore = runtime.getFirestore();
    const showRef = trackedShowDocRef(runtime, firestore, id);
    const existing = await runtime.getDoc(showRef);
    if (!existing.exists()) {
        return { outcome: 'rejected', reason: SHOW_NOT_FOUND_REASON };
    }
    const updatedShow: TrackedShow = {
        ...readTrackedShowSnapshot(existing),
        selectedStreamingProviderId: selectedProvider?.id,
        selectedStreamingProviderName: selectedProvider?.name,
        updatedAt
    };
    await runtime.setDoc(showRef, updatedShow);
    return { outcome: 'changed' };
}

function applyAudience(show: TrackedShow, targetAudience: ShowAudience, updatedAt: string): TrackedShow {
    const showWithNewAudience = targetAudience.kind === 'shared'
        ? withSharedVisibility(show)
        : withPrivateVisibility(show, targetAudience.profileId);
    return { ...showWithNewAudience, updatedAt };
}

async function findVisibilityCollision(
    runtime: FirestoreRuntime,
    firestore: Firestore,
    show: TrackedShow,
    targetAudience: ShowAudience
): Promise<TrackedShow | undefined> {
    const candidates = await findShowsByProviderShowId(runtime, firestore, show.providerShowId);
    return candidates.find(
        (candidate) => candidate.id !== show.id && audiencesCollide(resolveShowAudience(candidate), targetAudience)
    );
}

async function changeVisibility(
    runtime: FirestoreRuntime,
    id: string,
    targetAudience: ShowAudience,
    updatedAt: string
): Promise<ChangeVisibilityOutcome> {
    const firestore = runtime.getFirestore();
    const showRef = trackedShowDocRef(runtime, firestore, id);
    const existing = await runtime.getDoc(showRef);
    if (!existing.exists()) {
        return { outcome: 'rejected', reason: SHOW_NOT_FOUND_REASON };
    }
    const show = readTrackedShowSnapshot(existing);
    const collision = await findVisibilityCollision(runtime, firestore, show, targetAudience);
    if (collision !== undefined) {
        return { outcome: 'rejected', reason: VISIBILITY_COLLISION_REASONS[targetAudience.kind] };
    }
    return runtime.runTransaction(firestore, async (transaction) => {
        const showSnapshot = await transaction.get(showRef);
        if (!showSnapshot.exists()) {
            return { outcome: 'rejected', reason: SHOW_NOT_FOUND_REASON };
        }
        const freshShow = readTrackedShowSnapshot(showSnapshot);
        const updatedShow = applyAudience(freshShow, targetAudience, updatedAt);
        transaction.set(showRef, updatedShow);
        return { outcome: 'changed' };
    });
}

function applyListing(show: TrackedShow, targetListing: ShowListing, updatedAt: string): TrackedShow {
    const showWithNewListing = targetListing === 'hidden' ? withHiddenShow(show) : withListedShow(show);
    return { ...showWithNewListing, updatedAt };
}

async function changeListing(
    runtime: FirestoreRuntime,
    id: string,
    targetListing: ShowListing,
    updatedAt: string
): Promise<ChangeListingOutcome> {
    const firestore = runtime.getFirestore();
    const showRef = trackedShowDocRef(runtime, firestore, id);
    const existing = await runtime.getDoc(showRef);
    if (!existing.exists()) {
        return { outcome: 'rejected', reason: SHOW_NOT_FOUND_REASON };
    }
    return runtime.runTransaction(firestore, async (transaction) => {
        const showSnapshot = await transaction.get(showRef);
        if (!showSnapshot.exists()) {
            return { outcome: 'rejected', reason: SHOW_NOT_FOUND_REASON };
        }
        const freshShow = readTrackedShowSnapshot(showSnapshot);
        const updatedShow = applyListing(freshShow, targetListing, updatedAt);
        transaction.set(showRef, updatedShow);
        return { outcome: 'changed' };
    });
}

async function advanceProgress(
    runtime: FirestoreRuntime,
    id: string,
    targetEpisodeId: string,
    confirmedBy: string,
    today: string
): Promise<ProgressOutcome> {
    const firestore = runtime.getFirestore();
    const showRef = trackedShowDocRef(runtime, firestore, id);
    return runtime.runTransaction(firestore, async (transaction) => {
        const showSnapshot = await transaction.get(showRef);
        if (!showSnapshot.exists()) {
            return { outcome: 'rejected', reason: SHOW_NOT_FOUND_REASON };
        }
        const freshShow = readTrackedShowSnapshot(showSnapshot);
        const confirmedAt = readDeviceInstant();
        const outcome = computeAdvance(freshShow, targetEpisodeId, confirmedBy, confirmedAt, today);
        if (outcome.outcome === 'rejected') {
            return outcome;
        }
        transaction.set(showRef, outcome.show);
        const eventRef = progressEventDocRef(runtime, firestore, id, outcome.event.id);
        const eventData = toFirestoreConfirmedEvent(runtime, outcome.event);
        transaction.set(eventRef, eventData);
        return outcome;
    });
}

async function undoLastProgress(
    runtime: FirestoreRuntime,
    id: string,
    expectedRevision: number,
    undoneBy: string
): Promise<ProgressOutcome> {
    const firestore = runtime.getFirestore();
    const showRef = trackedShowDocRef(runtime, firestore, id);
    const eventsSnapshot = await runtime.getDocs(progressEventsCollectionRef(runtime, firestore, id));
    const progressEvents = eventsSnapshot.docs.map(readProgressEventSnapshot);
    return runtime.runTransaction(firestore, async (transaction) => {
        const showSnapshot = await transaction.get(showRef);
        if (!showSnapshot.exists()) {
            return { outcome: 'rejected', reason: SHOW_NOT_FOUND_REASON };
        }
        const freshShow = readTrackedShowSnapshot(showSnapshot);
        const undoneAt = readDeviceInstant();
        const outcome = computeUndo(freshShow, progressEvents, expectedRevision, undoneBy, undoneAt);
        if (outcome.outcome === 'rejected') {
            return outcome;
        }
        transaction.set(showRef, outcome.show);
        const eventRef = progressEventDocRef(runtime, firestore, id, outcome.event.id);
        transaction.update(eventRef, {
            undoneAt: runtime.serverTimestamp(),
            undoneBy: outcome.event.undoneBy
        });
        return outcome;
    });
}

async function resetProgress(
    runtime: FirestoreRuntime,
    id: string,
    targetPosition: InitialPositionChoice,
    resetAt: string,
    today: string
): Promise<ResetProgressOutcome> {
    const firestore = runtime.getFirestore();
    const showRef = trackedShowDocRef(runtime, firestore, id);
    const outcome = await runtime.runTransaction<ResetProgressOutcome>(firestore, async (transaction) => {
        const showSnapshot = await transaction.get(showRef);
        if (!showSnapshot.exists()) {
            return { outcome: 'rejected', reason: SHOW_NOT_FOUND_REASON };
        }
        const freshShow = readTrackedShowSnapshot(showSnapshot);
        const resetOutcome = computeReset(freshShow, targetPosition, resetAt, today);
        if (resetOutcome.outcome === 'applied') {
            transaction.set(showRef, resetOutcome.show);
        }
        return resetOutcome;
    });
    if (outcome.outcome === 'rejected') {
        return outcome;
    }
    const deleteEventsOperations = await buildDeleteEventsOperations(runtime, firestore, id);
    await commitInBatches(runtime, firestore, deleteEventsOperations);
    return outcome;
}

async function removeShow(runtime: FirestoreRuntime, id: string): Promise<RemoveShowOutcome> {
    const firestore = runtime.getFirestore();
    const showRef = trackedShowDocRef(runtime, firestore, id);
    const existing = await runtime.getDoc(showRef);
    if (!existing.exists()) {
        return { outcome: 'rejected', reason: SHOW_NOT_FOUND_REASON };
    }
    const eventsSnapshot = await runtime.getDocs(progressEventsCollectionRef(runtime, firestore, id));
    const batch = runtime.writeBatch(firestore);
    eventsSnapshot.docs.forEach((eventDoc) => batch.delete(eventDoc.ref));
    batch.delete(showRef);
    await batch.commit();
    return { outcome: 'removed' };
}

async function listAllProgressEvents(runtime: FirestoreRuntime): Promise<readonly ProgressEvent[]> {
    const firestore = runtime.getFirestore();
    const snapshot = await runtime.getDocs(runtime.collectionGroup(firestore, PROGRESS_EVENTS_COLLECTION));
    return snapshot.docs.map(readProgressEventSnapshot);
}

function deleteOperation(reference: DocumentReference<DocumentData, DocumentData>): BatchOperation {
    return (batch) => batch.delete(reference);
}

function setOperation(reference: DocumentReference<DocumentData, DocumentData>, data: DocumentData): BatchOperation {
    return (batch) => batch.set(reference, data);
}

async function buildDeleteEventsOperations(
    runtime: FirestoreRuntime,
    firestore: Firestore,
    trackedShowId: string
): Promise<readonly BatchOperation[]> {
    const eventsSnapshot = await runtime.getDocs(progressEventsCollectionRef(runtime, firestore, trackedShowId));
    return eventsSnapshot.docs.map((eventDoc) => deleteOperation(eventDoc.ref));
}

async function buildDeleteAllOperations(runtime: FirestoreRuntime, firestore: Firestore): Promise<readonly BatchOperation[]> {
    const showsSnapshot = await runtime.getDocs(trackedShowsCollectionRef(runtime, firestore));
    const eventDeleteGroups = await Promise.all(
        showsSnapshot.docs.map((showDoc) => buildDeleteEventsOperations(runtime, firestore, showDoc.id))
    );
    const showDeleteOperations = showsSnapshot.docs.map((showDoc) => deleteOperation(showDoc.ref));
    return [...eventDeleteGroups.flat(), ...showDeleteOperations];
}

function buildImportOperations(
    runtime: FirestoreRuntime,
    firestore: Firestore,
    shows: readonly TrackedShow[],
    progressEvents: readonly ProgressEvent[]
): readonly BatchOperation[] {
    const showOperations = shows.map((show) => setOperation(trackedShowDocRef(runtime, firestore, show.id), show));
    const eventOperations = progressEvents.map((event) => {
        const eventRef = progressEventDocRef(runtime, firestore, event.trackedShowId, event.id);
        const eventData = toFirestoreImportedEvent(runtime, event);
        return setOperation(eventRef, eventData);
    });
    return [...showOperations, ...eventOperations];
}

function chunk<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}

async function commitBatch(runtime: FirestoreRuntime, firestore: Firestore, operations: readonly BatchOperation[]): Promise<void> {
    const batch = runtime.writeBatch(firestore);
    operations.forEach((operation) => operation(batch));
    await batch.commit();
}

async function commitInBatches(
    runtime: FirestoreRuntime,
    firestore: Firestore,
    operations: readonly BatchOperation[]
): Promise<void> {
    const batches = chunk(operations, MAX_BATCH_WRITE_OPERATIONS);
    for (const batchOperations of batches) {
        await commitBatch(runtime, firestore, batchOperations);
    }
}

async function replaceAllShows(
    runtime: FirestoreRuntime,
    shows: readonly TrackedShow[],
    progressEvents: readonly ProgressEvent[]
): Promise<ReplaceAllShowsOutcome> {
    const firestore = runtime.getFirestore();
    try {
        const deleteOperations = await buildDeleteAllOperations(runtime, firestore);
        await commitInBatches(runtime, firestore, deleteOperations);
        const importOperations = buildImportOperations(runtime, firestore, shows, progressEvents);
        await commitInBatches(runtime, firestore, importOperations);
        return { outcome: 'replaced' };
    } catch {
        return { outcome: 'partial', reason: REPLACE_FAILURE_REASON };
    }
}

export function createFirestoreTrackedShowStore(runtime: FirestoreRuntime = defaultFirestoreRuntime): TrackedShowStore {
    return {
        subscribeToTrackedShows: (listener) => subscribeToTrackedShows(runtime, listener),
        subscribeToShow: (id, listener) => subscribeToShow(runtime, id, listener),
        addShow: (show) => addShow(runtime, show),
        updateCatalog: (show) => updateCatalog(runtime, show),
        changeProvider: (id, selectedProvider, updatedAt) => changeProvider(runtime, id, selectedProvider, updatedAt),
        changeVisibility: (id, targetAudience, updatedAt) => changeVisibility(runtime, id, targetAudience, updatedAt),
        changeListing: (id, targetListing, updatedAt) => changeListing(runtime, id, targetListing, updatedAt),
        advanceProgress: (id, targetEpisodeId, confirmedBy, today) =>
            advanceProgress(runtime, id, targetEpisodeId, confirmedBy, today),
        undoLastProgress: (id, expectedRevision, undoneBy) => undoLastProgress(runtime, id, expectedRevision, undoneBy),
        resetProgress: (id, targetPosition, resetAt, today) => resetProgress(runtime, id, targetPosition, resetAt, today),
        removeShow: (id) => removeShow(runtime, id),
        listAllProgressEvents: () => listAllProgressEvents(runtime),
        replaceAllShows: (shows, progressEvents) => replaceAllShows(runtime, shows, progressEvents)
    };
}

export const firestoreTrackedShowStore: TrackedShowStore = createFirestoreTrackedShowStore();
