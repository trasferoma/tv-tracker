import type { Ref } from 'vue';
import { useRegisterSW } from 'virtual:pwa-register/vue';

export interface UsePwaUpdate {
    readonly updateAvailable: Ref<boolean>;
    applyUpdate(): Promise<void>;
    dismiss(): void;
}

export function usePwaUpdate(): UsePwaUpdate {
    const { needRefresh, updateServiceWorker } = useRegisterSW();

    async function applyUpdate(): Promise<void> {
        await updateServiceWorker();
    }

    function dismiss(): void {
        needRefresh.value = false;
    }

    return { updateAvailable: needRefresh, applyUpdate, dismiss };
}
