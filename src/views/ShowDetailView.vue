<script setup lang="ts">
import { computed, ref, toRef } from 'vue';

import ConfirmDialog from '@/components/feedback/ConfirmDialog.vue';
import EmptyState from '@/components/feedback/EmptyState.vue';
import ToastMessage from '@/components/feedback/ToastMessage.vue';
import SeasonSection from '@/components/show/SeasonSection.vue';
import SpecialsSection from '@/components/show/SpecialsSection.vue';
import { useShowDetail, type ShowDetailDeps } from '@/composables/useShowDetail';
import { router } from '@/router';

const NO_PROVIDER_LABEL = 'Nessuna piattaforma indicata.';
const UNDO_APPLIED_MESSAGE = 'Ultima conferma annullata.';
const SHOW_NOT_FOUND_TITLE = 'Serie non trovata';
const SHOW_NOT_FOUND_MESSAGE = 'Questa serie non è più nella lista condivisa: potrebbe essere stata rimossa da un altro dispositivo.';

const props = defineProps<{ id: string; deps?: ShowDetailDeps }>();

const idRef = toRef(props, 'id');
const detail = useShowDetail(idRef, props.deps ?? {});

const toastMessage = ref<string>();

const readyContent = computed(() => {
    const status = detail.status.value;
    return status.kind === 'ready' ? status.content : undefined;
});

const misalignedStatus = computed(() => {
    const status = detail.status.value;
    return status.kind === 'misaligned' ? status : undefined;
});

const isNotFound = computed(() => detail.status.value.kind === 'notFound');
const isLoading = computed(() => detail.status.value.kind === 'loading');

const posterStyle = computed(() => {
    const posterUrl = readyContent.value?.posterUrl;
    return posterUrl === undefined ? {} : { backgroundImage: `url(${posterUrl})` };
});

const watchConfirmMessage = computed(() => {
    const target = detail.pendingWatch.value;
    return target === undefined ? '' : `Segnare “${target.headline}” e tutte le puntate precedenti come viste?`;
});

const removeConfirmMessage = computed(() => {
    const title = readyContent.value?.title;
    return title === undefined ? '' : `“${title}” verrà rimossa dalla lista condivisa. Questa operazione non può essere annullata.`;
});

function goHome(): void {
    void router.push({ name: 'home' });
}

async function confirmWatch(): Promise<void> {
    const outcome = await detail.confirmPendingWatch();
    if (outcome !== undefined && outcome.outcome === 'rejected') {
        toastMessage.value = outcome.reason;
    }
}

async function confirmUndo(): Promise<void> {
    const outcome = await detail.confirmPendingUndo();
    if (outcome === undefined) {
        return;
    }
    toastMessage.value = outcome.outcome === 'applied' ? UNDO_APPLIED_MESSAGE : outcome.reason;
}

async function confirmRemove(): Promise<void> {
    const outcome = await detail.confirmPendingRemove();
    if (outcome === undefined) {
        return;
    }
    if (outcome.outcome === 'removed') {
        goHome();
        return;
    }
    toastMessage.value = outcome.reason;
}

async function handleProviderChange(event: Event): Promise<void> {
    const selectElement = event.target as HTMLSelectElement;
    const providerId = selectElement.value === '' ? undefined : selectElement.value;
    const outcome = await detail.changeProvider(providerId);
    if (outcome !== undefined && outcome.outcome === 'rejected') {
        toastMessage.value = outcome.reason;
    }
}

function dismissToast(): void {
    toastMessage.value = undefined;
}
</script>

<template>
  <section class="detail">
    <RouterLink
      :to="{ name: 'home' }"
      class="back"
    >
      ← Serie seguite
    </RouterLink>

    <template v-if="readyContent">
      <div class="hero">
        <div
          class="poster"
          :style="posterStyle"
        >
          <span>{{ readyContent.title }}</span>
        </div>
        <div>
          <h2>{{ readyContent.title }}</h2>
          <p>
            {{ readyContent.backlogHeadline }}
            <br v-if="readyContent.upcomingHeadline">
            {{ readyContent.upcomingHeadline }}
          </p>
        </div>
      </div>

      <div
        v-if="readyContent.providers.length > 0"
        class="provider-row"
      >
        <label for="providerSelect">Piattaforma</label>
        <select
          id="providerSelect"
          class="provider-select"
          :value="readyContent.selectedProviderId ?? ''"
          @change="handleProviderChange"
        >
          <option
            v-for="provider in readyContent.providers"
            :key="provider.id"
            :value="provider.id"
          >
            {{ provider.name }}
          </option>
        </select>
      </div>
      <p
        v-else
        class="provider-none"
      >
        {{ NO_PROVIDER_LABEL }}
      </p>

      <button
        v-if="readyContent.canUndo"
        type="button"
        class="undo"
        @click="detail.requestUndo"
      >
        ↶ Annulla ultima conferma
      </button>

      <SeasonSection
        v-for="season in readyContent.seasons"
        :key="season.seasonNumber"
        :season="season"
        @watch="detail.requestWatch"
      />

      <SpecialsSection :episodes="readyContent.specials" />

      <button
        type="button"
        class="danger"
        @click="detail.requestRemove"
      >
        Rimuovi dalla lista
      </button>
    </template>

    <EmptyState
      v-else-if="isNotFound"
      :title="SHOW_NOT_FOUND_TITLE"
      :description="SHOW_NOT_FOUND_MESSAGE"
    />

    <EmptyState
      v-else-if="misalignedStatus"
      :title="misalignedStatus.title"
      :description="misalignedStatus.message"
    />

    <p
      v-else-if="isLoading"
      class="loading"
      role="status"
    >
      Caricamento…
    </p>

    <ConfirmDialog
      :open="detail.pendingWatch.value !== undefined"
      title="Conferma visualizzazione"
      :message="watchConfirmMessage"
      confirm-label="Segna come vista"
      @confirm="confirmWatch"
      @cancel="detail.cancelPendingWatch"
    />

    <ConfirmDialog
      :open="detail.pendingUndo.value"
      title="Annullare l’ultima conferma?"
      message="La serie tornerà esattamente alla posizione precedente."
      confirm-label="Conferma undo"
      @confirm="confirmUndo"
      @cancel="detail.cancelPendingUndo"
    />

    <ConfirmDialog
      :open="detail.pendingRemove.value"
      title="Eliminare la serie?"
      :message="removeConfirmMessage"
      confirm-label="Elimina serie"
      danger
      @confirm="confirmRemove"
      @cancel="detail.cancelPendingRemove"
    />

    <ToastMessage
      :message="toastMessage"
      @dismissed="dismissToast"
    />
  </section>
</template>

<style scoped>
.detail {
    padding-bottom: 24px;
}

.back {
    display: inline-flex;
    align-items: center;
    min-height: var(--tap);
    border: 0;
    background: none;
    color: var(--accent);
    font-weight: 800;
    padding: 10px 0;
    text-decoration: none;
}

.hero {
    display: grid;
    grid-template-columns: 105px 1fr;
    gap: 16px;
    margin: 10px 0 22px;
}

.hero .poster {
    position: relative;
    height: 155px;
    border-radius: var(--radius-lg);
    background: var(--surface-2) center/cover;
    display: grid;
    align-items: end;
    padding: 10px;
    isolation: isolate;
}

.hero .poster::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(transparent 35%, var(--poster-scrim));
    z-index: -1;
}

.hero .poster span {
    color: var(--text-inverse);
    font-weight: 900;
    line-height: .95;
    font-size: 14px;
    text-shadow: 0 2px 12px var(--poster-text-shadow);
}

.hero h2 {
    margin: 3px 0 7px;
    font-size: 25px;
}

.hero p {
    color: var(--text-dim);
    margin: 0;
    line-height: 1.45;
}

.provider-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 2px 16px;
}

.provider-row label {
    color: var(--text-dim);
    font-size: 14px;
    font-weight: 750;
}

.provider-select {
    min-height: var(--tap);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    padding: 0 12px;
    font-weight: 750;
}

.provider-none {
    margin: 0 2px 16px;
    color: var(--text-dim);
    font-size: 13px;
}

.undo {
    width: 100%;
    min-height: var(--tap);
    margin: 2px 0 10px;
    border: 1px solid var(--warn-border);
    border-radius: var(--radius-sm);
    background: var(--warn-soft);
    color: var(--warn-ink);
    font-weight: 850;
}

.danger {
    width: 100%;
    min-height: var(--tap);
    margin-top: 18px;
    border: 1px solid var(--danger-border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--danger);
    font-weight: 850;
}

.loading {
    padding: 24px;
    text-align: center;
    color: var(--text-dim);
}
</style>
