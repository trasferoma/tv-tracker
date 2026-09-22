// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import ResetProgressDialog from './ResetProgressDialog.vue';
import type { Episode, InitialPositionChoice } from '@/domain/trackedShow';

function buildEpisode(seasonNumber: number, episodeNumber: number, title: string, airDate: string): Episode {
    return { providerEpisodeId: `s${seasonNumber}e${episodeNumber}`, seasonNumber, episodeNumber, title, airDate };
}

const EPISODES: readonly Episode[] = [
    buildEpisode(1, 1, 'S1E1', '2026-01-01'),
    buildEpisode(1, 2, 'S1E2', '2026-01-08')
];

const mountedWrappers: Array<VueWrapper> = [];

function mountDialog(overrides: {
    open?: boolean;
    modelValue?: InitialPositionChoice;
    confirmationMessage?: string;
} = {}): VueWrapper {
    const wrapper = mount(ResetProgressDialog, {
        props: {
            open: overrides.open ?? true,
            episodes: EPISODES,
            modelValue: overrides.modelValue ?? { kind: 'notStarted' },
            confirmationMessage: overrides.confirmationMessage ?? 'Il tracciamento riparte da capo.'
        }
    });
    mountedWrappers.push(wrapper);
    return wrapper;
}

afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) {
        wrapper.unmount();
    }
});

describe('ResetProgressDialog', () => {
    it('mostra il titolo, il messaggio di conferma e la variante rossa', () => {
        const wrapper = mountDialog({ confirmationMessage: 'Il tracciamento riparte da S1E1.' });

        expect(wrapper.find('.confirm-dialog h2').text()).toBe('Azzerare il tracciamento?');
        expect(wrapper.find('.confirm-dialog p').text()).toBe('Il tracciamento riparte da S1E1.');
        expect(wrapper.find('.accept-confirm--danger').text()).toBe('Azzera tracciamento');
    });

    it('compone il picker esistente con le puntate ricevute', () => {
        const wrapper = mountDialog();

        expect(wrapper.find('.position-picker').exists()).toBe(true);
        expect(wrapper.findAll('.position-choice')).toHaveLength(2);
    });

    it('inoltra la scelta del picker come update:modelValue', async () => {
        const wrapper = mountDialog();

        await wrapper.findAll('.position-choice')[1]?.trigger('click');

        expect(wrapper.emitted('update:modelValue')).toEqual([[{ kind: 'watchedThrough', episodeId: 's1e1' }]]);
    });

    it('emette confirm quando si preme il pulsante di conferma', async () => {
        const wrapper = mountDialog();

        await wrapper.find('.accept-confirm').trigger('click');

        expect(wrapper.emitted('confirm')).toHaveLength(1);
    });

    it('emette cancel quando si preme il pulsante di annullamento', async () => {
        const wrapper = mountDialog();

        await wrapper.find('.cancel-confirm').trigger('click');

        expect(wrapper.emitted('cancel')).toHaveLength(1);
    });
});
