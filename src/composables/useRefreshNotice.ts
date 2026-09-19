import { ref, type Ref } from 'vue';

import { catalogRefresh as defaultCatalogRefresh, type CatalogRefreshOutcome, type UseCatalogRefresh } from './useCatalogRefresh';

const REFRESH_SUCCEEDED_MESSAGE = 'Serie aggiornate dalla rete.';
const NO_SHOWS_MESSAGE = 'Nessuna serie da aggiornare.';

export interface RefreshNotice {
    readonly message: Ref<string | undefined>;
    requestRefresh(): Promise<void>;
    dismiss(): void;
}

export function createRefreshNotice(catalogRefresh: UseCatalogRefresh = defaultCatalogRefresh): RefreshNotice {
    const message = ref<string>();

    async function requestRefresh(): Promise<void> {
        const outcome = await catalogRefresh.refreshManually();
        message.value = resolveMessage(outcome);
    }

    function dismiss(): void {
        message.value = undefined;
    }

    return { message, requestRefresh, dismiss };
}

function resolveMessage(outcome: CatalogRefreshOutcome): string {
    if (outcome.outcome === 'updated') {
        return REFRESH_SUCCEEDED_MESSAGE;
    }
    if (outcome.outcome === 'noShows') {
        return NO_SHOWS_MESSAGE;
    }
    return outcome.reason;
}

export const refreshNotice = createRefreshNotice();

export function useRefreshNotice(): RefreshNotice {
    return refreshNotice;
}
