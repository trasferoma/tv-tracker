import { afterEach, describe, expect, it, vi } from 'vitest';

import { browserActiveProfileStorage, type ActiveProfileStorage } from './activeProfileStorage';
import type { CredentialCheck, CredentialCheckOutcome } from './credentialCheck';
import { userProfiles } from './profiles';
import { createSession } from './session';
import { advanceProgress } from '@/domain/progressAdvance';
import type { Episode, Season, TrackedShow } from '@/domain/trackedShow';

const VALID_PASSWORD = 'password-di-test';
const FABIO = userProfiles[0]!;
const IRENE = userProfiles[1]!;

function buildFakeCredentialCheck(): CredentialCheck {
    return {
        checkCredentials: (profileId, password): Promise<CredentialCheckOutcome> => {
            const profile = userProfiles.find((candidate) => candidate.id === profileId);
            if (profile === undefined) {
                return Promise.resolve({ outcome: 'rejected', reason: 'Scegli Fabio oppure Irene.' });
            }
            if (password !== VALID_PASSWORD) {
                return Promise.resolve({ outcome: 'rejected', reason: 'Password non corretta.' });
            }
            return Promise.resolve({ outcome: 'authenticated', profile });
        }
    };
}

function buildMemoryStorage(): ActiveProfileStorage {
    let savedProfileId: string | undefined;
    return {
        load: () => savedProfileId,
        save: (profileId) => {
            savedProfileId = profileId;
        },
        clear: () => {
            savedProfileId = undefined;
        }
    };
}

function buildShowWithSingleEpisode(): TrackedShow {
    const episode: Episode = {
        providerEpisodeId: 's1e1',
        seasonNumber: 1,
        episodeNumber: 1,
        title: 'Pilot',
        airDate: '2026-01-01'
    };
    const season: Season = { providerSeasonId: 'season-1', seasonNumber: 1, episodes: [episode] };
    return {
        id: 'show-1',
        catalogProvider: 'tmdb',
        providerShowId: 'tmdb-1',
        title: 'Serie di prova',
        status: 'In corso',
        seasons: [season],
        italianProviders: [],
        progressRevision: 0,
        addedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z'
    };
}

async function waitForRestoreToSettle(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

describe('createSession', () => {
    it('parte da "restoring" finché il ripristino della sessione non è concluso', () => {
        const session = createSession(buildFakeCredentialCheck(), buildMemoryStorage());

        expect(session.state.value).toEqual({ status: 'restoring' });
    });

    it('ripristina "authenticated" con il profilo giusto quando lo storage ha un profilo salvato', async () => {
        const storage = buildMemoryStorage();
        storage.save('irene');

        const session = createSession(buildFakeCredentialCheck(), storage);
        await waitForRestoreToSettle();

        expect(session.state.value).toEqual({ status: 'authenticated', profile: IRENE });
    });

    it('ripristina "anonymous" quando lo storage non ha nessun profilo salvato', async () => {
        const session = createSession(buildFakeCredentialCheck(), buildMemoryStorage());

        await waitForRestoreToSettle();

        expect(session.state.value).toEqual({ status: 'anonymous' });
    });

    it('autentica e valorizza l\'identità attiva con la password corretta', async () => {
        const session = createSession(buildFakeCredentialCheck(), buildMemoryStorage());

        const outcome = await session.login('fabio', VALID_PASSWORD);

        expect(outcome).toEqual({ outcome: 'authenticated', profile: FABIO });
        expect(session.state.value).toEqual({ status: 'authenticated', profile: FABIO });
    });

    it('con credenziali errate lascia lo stato invariato e restituisce il rifiuto', async () => {
        const session = createSession(buildFakeCredentialCheck(), buildMemoryStorage());
        await waitForRestoreToSettle();

        const outcome = await session.login('fabio', 'password-sbagliata');

        expect(outcome).toEqual({ outcome: 'rejected', reason: 'Password non corretta.' });
        expect(session.state.value).toEqual({ status: 'anonymous' });
    });

    it('sopravvive a una riapertura simulata, ricreando lo stato dallo storage condiviso', async () => {
        const storage = buildMemoryStorage();
        const firstOpening = createSession(buildFakeCredentialCheck(), storage);
        await firstOpening.login('irene', VALID_PASSWORD);

        const secondOpening = createSession(buildFakeCredentialCheck(), storage);
        await waitForRestoreToSettle();

        expect(secondOpening.state.value).toEqual({ status: 'authenticated', profile: IRENE });
    });

    it('«Esci» cancella la sessione memorizzata, anche per una riapertura successiva', async () => {
        const storage = buildMemoryStorage();
        const session = createSession(buildFakeCredentialCheck(), storage);
        await session.login('fabio', VALID_PASSWORD);

        session.logout();

        expect(session.state.value).toEqual({ status: 'anonymous' });
        const reopenedSession = createSession(buildFakeCredentialCheck(), storage);
        await waitForRestoreToSettle();
        expect(reopenedSession.state.value).toEqual({ status: 'anonymous' });
    });

    it('alimenta confirmedBy con l\'identità attiva quando si conferma un avanzamento', async () => {
        const session = createSession(buildFakeCredentialCheck(), buildMemoryStorage());
        await session.login('irene', VALID_PASSWORD);
        const activeState = session.state.value;
        if (activeState.status !== 'authenticated') {
            throw new Error('login inatteso non riuscito');
        }
        const confirmedBy = activeState.profile.id;

        const show = buildShowWithSingleEpisode();
        const outcome = advanceProgress(show, 's1e1', confirmedBy, '2026-01-02T00:00:00Z', '2026-01-02');

        if (outcome.outcome !== 'applied') {
            throw new Error('avanzamento inatteso rifiutato');
        }
        expect(outcome.event.confirmedBy).toBe('irene');
    });
});

describe('createSession con browserActiveProfileStorage', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('ripristina "anonymous" senza propagare eccezioni quando localStorage lancia', async () => {
        vi.stubGlobal('localStorage', {
            getItem: () => {
                throw new Error('storage bloccato');
            },
            setItem: () => {
                throw new Error('storage bloccato');
            },
            removeItem: () => {
                throw new Error('storage bloccato');
            }
        });

        const session = createSession(buildFakeCredentialCheck(), browserActiveProfileStorage);
        await waitForRestoreToSettle();

        expect(session.state.value).toEqual({ status: 'anonymous' });
    });
});
