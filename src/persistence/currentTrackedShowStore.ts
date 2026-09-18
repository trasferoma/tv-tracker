import { localTrackedShowStore } from './localTrackedShowStore';
import type { TrackedShowStore } from './trackedShowStore';

export const currentTrackedShowStore: TrackedShowStore = localTrackedShowStore;
