<script setup lang="ts">
import { computed } from 'vue';

import type { ItalianProvider } from '@/domain/trackedShow';

const NO_PROVIDER_LABEL = 'Nessuna piattaforma';

const props = defineProps<{
    providers: readonly ItalianProvider[];
}>();

const emit = defineEmits<{ choose: [providerId: string | undefined] }>();

const hasMultipleProviders = computed(() => props.providers.length > 1);
const singleProvider = computed(() => (props.providers.length === 1 ? props.providers[0] : undefined));
const singleProviderLabel = computed(() => singleProvider.value?.name ?? NO_PROVIDER_LABEL);

function chooseProvider(providerId: string): void {
    emit('choose', providerId);
}

function continueWithSingleChoice(): void {
    emit('choose', singleProvider.value?.id);
}
</script>

<template>
  <div class="provider-step">
    <h3>Scegli la piattaforma</h3>
    <p>Dove state guardando questa serie?</p>
    <div
      v-if="hasMultipleProviders"
      class="provider-options"
    >
      <button
        v-for="provider in providers"
        :key="provider.id"
        type="button"
        class="provider-choice"
        @click="chooseProvider(provider.id)"
      >
        {{ provider.name }}
      </button>
    </div>
    <template v-else>
      <p class="provider-single">
        {{ singleProviderLabel }}
      </p>
      <button
        type="button"
        class="primary"
        @click="continueWithSingleChoice"
      >
        Continua
      </button>
    </template>
  </div>
</template>

<style scoped>
.provider-step h3 {
    margin: 4px 0 5px;
}

.provider-step > p {
    margin: 0 0 16px;
    color: var(--text-dim);
    font-size: 14px;
}

.provider-options {
    display: grid;
    gap: 9px;
}

.provider-choice {
    min-height: var(--tap);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--text);
    font-weight: 800;
    text-align: left;
    padding: 0 15px;
    width: 100%;
}

.provider-choice:hover,
.provider-choice:focus-visible {
    border-color: var(--accent);
    background: var(--accent-soft);
}

.provider-single {
    margin: 0 0 14px;
    font-weight: 800;
}

.primary {
    min-height: var(--tap);
    border: 0;
    border-radius: var(--radius-md);
    background: var(--accent);
    color: var(--text-inverse);
    font-weight: 850;
    padding: 0 16px;
    width: 100%;
}
</style>
