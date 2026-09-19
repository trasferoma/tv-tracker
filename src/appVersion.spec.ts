import { describe, expect, it } from 'vitest';

import { APP_VERSION } from './appVersion';

describe('APP_VERSION', () => {
    it('ha la forma attesa, così resta leggibile e confrontabile in fondo alla home', () => {
        expect(APP_VERSION).toMatch(/^v\d+\.\d+\.\d{3}$/);
    });
});
