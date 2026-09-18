// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';

import ConfirmDialog from './ConfirmDialog.vue';

afterEach(() => {
    document.body.innerHTML = '';
});

describe('ConfirmDialog', () => {
    it('emette cancel quando si preme Escape', async () => {
        const wrapper = mount(ConfirmDialog, {
            props: { open: true, title: 'Conferma visualizzazione', message: 'Segnare come vista?' }
        });

        await wrapper.find('dialog').trigger('keydown', { key: 'Escape' });

        expect(wrapper.emitted('cancel')).toHaveLength(1);
        expect(wrapper.emitted('confirm')).toBeUndefined();
    });

    it('emette cancel cliccando su Annulla', async () => {
        const wrapper = mount(ConfirmDialog, {
            props: { open: true, title: 'Conferma visualizzazione', message: 'Segnare come vista?' }
        });

        await wrapper.find('.cancel-confirm').trigger('click');

        expect(wrapper.emitted('cancel')).toHaveLength(1);
        expect(wrapper.emitted('confirm')).toBeUndefined();
    });

    it('emette confirm solo cliccando sul pulsante di conferma', async () => {
        const wrapper = mount(ConfirmDialog, {
            props: {
                open: true,
                title: 'Conferma visualizzazione',
                message: 'Segnare come vista?',
                confirmLabel: 'Segna come vista'
            }
        });

        await wrapper.find('.accept-confirm').trigger('click');

        expect(wrapper.emitted('confirm')).toHaveLength(1);
        expect(wrapper.emitted('cancel')).toBeUndefined();
        expect(wrapper.find('.accept-confirm').text()).toBe('Segna come vista');
    });

    it('rende riconoscibile la variante distruttiva', () => {
        const dangerWrapper = mount(ConfirmDialog, {
            props: { open: true, title: 'Eliminare la serie?', message: 'Operazione non annullabile.', danger: true }
        });
        const normalWrapper = mount(ConfirmDialog, {
            props: { open: true, title: 'Conferma visualizzazione', message: 'Segnare come vista?' }
        });

        expect(dangerWrapper.find('.accept-confirm').classes()).toContain('accept-confirm--danger');
        expect(normalWrapper.find('.accept-confirm').classes()).not.toContain('accept-confirm--danger');
    });
});

describe('ConfirmDialog — utilizzabilità da tastiera', () => {
    it('sposta il focus nel dialogo quando si apre', async () => {
        const wrapper = mount(ConfirmDialog, {
            attachTo: document.body,
            props: { open: true, title: 'Conferma visualizzazione', message: 'Segnare come vista?' }
        });
        await nextTick();

        expect(document.activeElement).toBe(wrapper.find('dialog').element);
    });

    it('non lascia uscire il focus dal dialogo: Tab dall ultimo controllo torna al primo', async () => {
        const wrapper = mount(ConfirmDialog, {
            attachTo: document.body,
            props: { open: true, title: 'Conferma visualizzazione', message: 'Segnare come vista?' }
        });
        await nextTick();
        const cancelButton = wrapper.find('.cancel-confirm').element as HTMLElement;
        const confirmButton = wrapper.find('.accept-confirm').element as HTMLElement;
        confirmButton.focus();

        await wrapper.find('dialog').trigger('keydown', { key: 'Tab' });

        expect(document.activeElement).toBe(cancelButton);
    });

    it('non lascia uscire il focus dal dialogo: Shift+Tab dal primo controllo torna all ultimo', async () => {
        const wrapper = mount(ConfirmDialog, {
            attachTo: document.body,
            props: { open: true, title: 'Conferma visualizzazione', message: 'Segnare come vista?' }
        });
        await nextTick();
        const cancelButton = wrapper.find('.cancel-confirm').element as HTMLElement;
        const confirmButton = wrapper.find('.accept-confirm').element as HTMLElement;
        cancelButton.focus();

        await wrapper.find('dialog').trigger('keydown', { key: 'Tab', shiftKey: true });

        expect(document.activeElement).toBe(confirmButton);
    });

    it('restituisce il focus all elemento che aveva aperto il dialogo, quando si chiude', async () => {
        const triggerButton = document.createElement('button');
        document.body.appendChild(triggerButton);
        triggerButton.focus();

        const wrapper = mount(ConfirmDialog, {
            attachTo: document.body,
            props: { open: false, title: 'Conferma visualizzazione', message: 'Segnare come vista?' }
        });

        await wrapper.setProps({ open: true });
        await nextTick();
        expect(document.activeElement).toBe(wrapper.find('dialog').element);

        await wrapper.setProps({ open: false });

        expect(document.activeElement).toBe(triggerButton);
    });
});
