import { ref, type Ref } from 'vue';

const REFRESH_NOT_AVAILABLE_MESSAGE = 'Aggiornamento dalla rete non ancora disponibile.';

export interface RefreshNotice {
    readonly message: Ref<string | undefined>;
    requestRefresh(): void;
    dismiss(): void;
}

export function createRefreshNotice(): RefreshNotice {
    const message = ref<string>();

    function requestRefresh(): void {
        message.value = REFRESH_NOT_AVAILABLE_MESSAGE;
    }

    function dismiss(): void {
        message.value = undefined;
    }

    return { message, requestRefresh, dismiss };
}

export const refreshNotice = createRefreshNotice();

export function useRefreshNotice(): RefreshNotice {
    return refreshNotice;
}
