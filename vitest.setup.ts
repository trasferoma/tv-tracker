import { webcrypto } from 'node:crypto';

import 'fake-indexeddb/auto';
import { vi } from 'vitest';

if (typeof globalThis.crypto === 'undefined') {
    globalThis.crypto = webcrypto as Crypto;
}

// La suite non deve dipendere da .env.local, che non è versionato: senza questo
// stub, sulle macchine dove manca il file, `@/auth/session` risolverebbe al ramo
// Firebase e fallirebbe già al solo import per configurazione mancante, e i
// composable che risolvono `currentTrackedShowStore` proverebbero connessioni
// Firestore reali. Un singolo test può ancora sostituire `@/localMode` con
// `vi.doMock` per esercitare il ramo non locale di un componente.
vi.stubEnv('VITE_LOCAL_MODE', 'true');
