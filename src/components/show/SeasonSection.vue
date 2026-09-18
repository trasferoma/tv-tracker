<script setup lang="ts">
import EpisodeRow from '@/components/show/EpisodeRow.vue';
import UpcomingEpisodeBox from '@/components/show/UpcomingEpisodeBox.vue';
import type { SeasonSectionView } from '@/composables/useShowDetail';

defineProps<{
    season: SeasonSectionView;
}>();

const emit = defineEmits<{ watch: [episodeId: string] }>();

function requestWatch(episodeId: string): void {
    emit('watch', episodeId);
}
</script>

<template>
  <details
    class="season"
    :open="season.defaultOpen"
  >
    <summary>Stagione {{ season.seasonNumber }} · {{ season.remainingCount }} da vedere</summary>
    <EpisodeRow
      v-for="episode in season.episodes"
      :key="episode.id"
      :episode="episode"
      @watch="requestWatch"
    />
    <UpcomingEpisodeBox
      v-if="season.upcoming"
      :box="season.upcoming"
    />
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
</style>
