import { describe, expect, it } from 'vitest';

import { APP_VERSION } from './appVersion';

describe('APP_VERSION', () => {
    it('parte dalla versione iniziale dello scaffold', () => {
        expect(APP_VERSION).toBe('v1.0.000');
    });
});
