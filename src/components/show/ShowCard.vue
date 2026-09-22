<script setup lang="ts">
import { computed } from 'vue';

import type { ShowListItem } from '@/composables/useTrackedShows';
import PrivateShowDot from '@/components/show/PrivateShowDot.vue';
import ShowBadge from '@/components/show/ShowBadge.vue';

const props = defineProps<{
    item: ShowListItem;
}>();

const emit = defineEmits<{ watch: [showId: string] }>();

const posterStyle = computed(() => (
    props.item.posterUrl === undefined ? {} : { backgroundImage: `url(${props.item.posterUrl})` }
));

function requestWatch(): void {
    emit('watch', props.item.id);
}
</script>

<template>
  <article class="show">
    <div class="show-main">
      <div
        class="poster"
        :style="posterStyle"
      >
        <span>{{ item.title }}</span>
      </div>
      <div class="body">
        <div class="title-row">
          <div class="title">
            {{ item.title }}
          </div>
          <div
            v-if="item.isHidden || item.privateProfileId !== undefined"
            class="title-badges"
          >
            <span
              v-if="item.isHidden"
              class="hidden-marker"
            >Nascosta</span>
            <PrivateShowDot
              v-if="item.privateProfileId !== undefined"
              :profile-id="item.privateProfileId"
            />
          </div>
        </div>
        <ShowBadge
          :label="item.badgeLabel"
          :is-caught-up="item.isCaughtUp"
        />
        <span
          v-if="item.providerLabel"
          class="provider"
        >{{ item.providerLabel }}</span>
        <p
          v-if="item.errorMessage"
          class="show-error"
        >
          {{ item.errorMessage }}
        </p>
        <div
          v-else
          class="episode"
        >
          <strong>{{ item.episodeHeadline }}</strong>
          <small v-if="item.episodeDateLabel">{{ item.episodeDateLabel }}</small>
        </div>
        <div class="actions">
          <button
            v-if="item.canConfirmWatched"
            type="button"
            class="primary"
            @click="requestWatch"
          >
            ✓ Vista
          </button>
          <RouterLink
            :to="{ name: 'show-detail', params: { id: item.id } }"
            class="secondary"
          >
            Dettaglio
          </RouterLink>
        </div>
      </div>
    </div>
    <div
      v-if="item.upcomingLabel"
      class="show-foot"
    >
      <span class="future">{{ item.upcomingLabel }}</span>
    </div>
  </article>
</template>

<style scoped>
.show {
    overflow: hidden;
    border: 1px solid var(--border);
    background: var(--surface);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
}

.show-main {
    display: grid;
    grid-template-columns: 92px 1fr;
    min-height: 142px;
}

.poster {
    position: relative;
    background: var(--surface-2) center/cover;
    display: grid;
    align-items: end;
    padding: 10px;
    isolation: isolate;
}

.poster::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(transparent 35%, var(--poster-scrim));
    z-index: -1;
}

.poster span {
    color: var(--text-inverse);
    font-weight: 900;
    line-height: .95;
    font-size: 16px;
    text-shadow: 0 2px 12px var(--poster-text-shadow);
}

.body {
    padding: 14px 14px 12px;
    min-width: 0;
}

.title-row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
}

.title {
    font-size: 18px;
    font-weight: 850;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.title-badges {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
}

.title-badges :deep(.private-dot) {
    margin-left: 0;
}

.hidden-marker {
    color: var(--text-dim);
    font-size: 11px;
    font-weight: 750;
    white-space: nowrap;
}

.provider {
    display: inline-flex;
    margin: 8px 0 0 6px;
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 4px 8px;
    color: var(--text-dim);
    font-size: 12px;
    font-weight: 750;
}

.episode {
    margin-top: 12px;
}

.episode strong {
    display: block;
    font-size: 14px;
}

.episode small {
    color: var(--text-dim);
    display: block;
    margin-top: 3px;
}

.show-error {
    margin: 12px 0 0;
    color: var(--danger);
    font-size: 13px;
    line-height: 1.4;
}

.actions {
    display: flex;
    gap: 8px;
    margin-top: 12px;
}

.primary,
.secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--tap);
    border-radius: var(--radius-sm);
    padding: 0 14px;
    font-weight: 850;
    text-decoration: none;
}

.primary {
    background: var(--accent);
    color: var(--text-inverse);
    border: 0;
}

.secondary {
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
}

.show-foot {
    border-top: 1px solid var(--border);
    padding: 10px 14px;
    color: var(--text-dim);
    font-size: 12px;
    background: var(--surface-3);
}

.future {
    color: var(--warn);
}
</style>
