import { webcrypto } from 'node:crypto';

import 'fake-indexeddb/auto';

if (typeof globalThis.crypto === 'undefined') {
    globalThis.crypto = webcrypto as Crypto;
}
