import Dexie, { type Table } from 'dexie';

import type { ProgressEvent, TrackedShow } from '@/domain/trackedShow';

class TvTrackerDatabase extends Dexie {
    trackedShows!: Table<TrackedShow, string>;
    progressEvents!: Table<ProgressEvent, string>;

    constructor() {
        super('tv-tracker');
        this.version(1).stores({
            trackedShows: 'id, providerShowId',
            progressEvents: 'id, trackedShowId'
        });
    }
}

export const tvTrackerDatabase = new TvTrackerDatabase();
