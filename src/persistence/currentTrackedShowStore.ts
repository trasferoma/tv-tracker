import { firestoreTrackedShowStore } from './firestoreTrackedShowStore';
import { localTrackedShowStore } from './localTrackedShowStore';
import type { TrackedShowStore } from './trackedShowStore';
import { isLocalMode } from '@/localMode';

export const currentTrackedShowStore: TrackedShowStore = isLocalMode ? localTrackedShowStore : firestoreTrackedShowStore;
