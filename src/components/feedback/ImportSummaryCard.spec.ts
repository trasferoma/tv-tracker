// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import ImportSummaryCard from './ImportSummaryCard.vue';
import type { BackupImportSummary } from '@/backup/backupImport';

function buildSummary(overrides: Partial<BackupImportSummary> = {}): BackupImportSummary {
    return { totalInFile: 3, newCount: 1, alreadyPresentCount: 2, newerThanLocalCount: 1, ...overrides };
}

afterEach(() => {
    document.body.innerHTML = '';
});

describe('ImportSummaryCard', () => {
    it('mostra i conteggi del riepilogo e il messaggio sul rischio di orologi non sincronizzati', () => {
        const wrapper = mount(ImportSummaryCard, {
            props: { summary: buildSummary(), clockSkewWarning: 'attenzione agli orologi' }
        });

        expect(wrapper.text()).toContain('3');
        expect(wrapper.text()).toContain('1');
        expect(wrapper.text()).toContain('2');
        expect(wrapper.text()).toContain('attenzione agli orologi');
    });

    it('emette merge, replace e cancel dai rispettivi pulsanti', async () => {
        const wrapper = mount(ImportSummaryCard, {
            props: { summary: buildSummary(), clockSkewWarning: 'attenzione' }
        });

        await wrapper.find('.merge').trigger('click');
        await wrapper.find('.replace').trigger('click');
        await wrapper.find('.cancel').trigger('click');

        expect(wrapper.emitted('merge')).toHaveLength(1);
        expect(wrapper.emitted('replace')).toHaveLength(1);
        expect(wrapper.emitted('cancel')).toHaveLength(1);
    });
});
