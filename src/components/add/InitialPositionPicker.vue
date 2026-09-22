<script setup lang="ts">
import { computed } from 'vue';

import type { Episode, InitialPositionChoice } from '@/domain/trackedShow';
import { formatEpisodeCode } from '@/presentation/italianFormat';

const props = defineProps<{
    episodes: readonly Episode[];
    modelValue: InitialPositionChoice;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: InitialPositionChoice] }>();

const hasEpisodes = computed(() => props.episodes.length > 0);
const isWatchedThrough = computed(() => props.modelValue.kind === 'watchedThrough');

const selectedEpisode = computed(() => {
    const position = props.modelValue;
    if (position.kind !== 'watchedThrough') {
        return undefined;
    }
    return props.episodes.find((episode) => episode.providerEpisodeId === position.episodeId);
});

const seasonNumbers = computed(() => {
    const episodeSeasonNumbers = props.episodes.map((episode) => episode.seasonNumber);
    const uniqueSeasonNumbers = new Set(episodeSeasonNumbers);
    return [...uniqueSeasonNumbers].sort((a, b) => a - b);
});

const selectedSeasonNumber = computed(() => selectedEpisode.value?.seasonNumber ?? seasonNumbers.value[0]);

const episodesInSelectedSeason = computed(() => (
    props.episodes.filter((episode) => episode.seasonNumber === selectedSeasonNumber.value)
));

function episodeLabel(episode: Episode): string {
    return `${formatEpisodeCode(episode.seasonNumber, episode.episodeNumber)} · ${episode.title}`;
}

function selectNotStarted(): void {
    emit('update:modelValue', { kind: 'notStarted' });
}

function selectFirstWatchedEpisode(): void {
    const firstEpisode = props.episodes[0];
    if (firstEpisode === undefined) {
        return;
    }
    emit('update:modelValue', { kind: 'watchedThrough', episodeId: firstEpisode.providerEpisodeId });
}

function changeSeason(event: Event): void {
    const selectElement = event.target as HTMLSelectElement;
    const seasonNumber = Number(selectElement.value);
    const firstEpisodeOfSeason = props.episodes.find((episode) => episode.seasonNumber === seasonNumber);
    if (firstEpisodeOfSeason === undefined) {
        return;
    }
    emit('update:modelValue', { kind: 'watchedThrough', episodeId: firstEpisodeOfSeason.providerEpisodeId });
}

function changeEpisode(event: Event): void {
    const selectElement = event.target as HTMLSelectElement;
    emit('update:modelValue', { kind: 'watchedThrough', episodeId: selectElement.value });
}
</script>

<template>
  <div class="position-picker">
    <h3>Da dove iniziate?</h3>
    <div class="position-options">
      <button
        type="button"
        class="position-choice"
        :class="{ selected: !isWatchedThrough }"
        @click="selectNotStarted"
      >
        Da iniziare
      </button>
      <button
        v-if="hasEpisodes"
        type="button"
        class="position-choice"
        :class="{ selected: isWatchedThrough }"
        @click="selectFirstWatchedEpisode"
      >
        Ho già visto qualche puntata
      </button>
    </div>
    <div
      v-if="isWatchedThrough"
      class="position-selects"
    >
      <select
        aria-label="Stagione già vista"
        :value="selectedSeasonNumber"
        @change="changeSeason"
      >
        <option
          v-for="seasonNumber in seasonNumbers"
          :key="seasonNumber"
          :value="seasonNumber"
        >
          Stagione {{ seasonNumber }}
        </option>
      </select>
      <select
        aria-label="Ultimo episodio visto"
        :value="selectedEpisode?.providerEpisodeId"
        @change="changeEpisode"
      >
        <option
          v-for="episode in episodesInSelectedSeason"
          :key="episode.providerEpisodeId"
          :value="episode.providerEpisodeId"
        >
          {{ episodeLabel(episode) }}
        </option>
      </select>
    </div>
  </div>
</template>

<style scoped>
.position-picker h3 {
    margin: 4px 0 10px;
}

.position-options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 9px;
    margin-bottom: 12px;
}

.position-choice {
    min-height: var(--tap);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--text);
    font-weight: 800;
    padding: 0 10px;
}

.position-choice.selected {
    border-color: var(--accent);
    background: var(--accent-soft);
}

.position-selects {
    display: grid;
    gap: 9px;
}

.position-selects select {
    min-height: var(--tap);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--text);
    padding: 0 12px;
    font-weight: 750;
    width: 100%;
}
</style>
