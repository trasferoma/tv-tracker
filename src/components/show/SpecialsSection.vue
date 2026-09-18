<script setup lang="ts">
import type { EpisodeRowView } from '@/composables/useShowDetail';

defineProps<{
    episodes: readonly EpisodeRowView[];
}>();
</script>

<template>
  <details
    v-if="episodes.length > 0"
    class="season"
  >
    <summary>Speciali · {{ episodes.length }}</summary>
    <div
      v-for="episode in episodes"
      :key="episode.id"
      class="episode-row"
    >
      <div>
        <strong>{{ episode.headline }}</strong>
        <small>{{ episode.dateLabel }}</small>
      </div>
    </div>
  </details>
</template>

<style scoped>
.season {
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    margin-bottom: 10px;
    overflow: hidden;
    background: var(--surface);
}

.season summary {
    padding: 15px;
    min-height: var(--tap);
    display: flex;
    align-items: center;
    background: var(--surface);
    font-weight: 850;
    cursor: pointer;
}

.episode-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 13px 15px;
    border-top: 1px solid var(--border);
}

.episode-row small {
    display: block;
    color: var(--text-dim);
    margin-top: 3px;
}
</style>
