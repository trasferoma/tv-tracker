<script setup lang="ts">
export type IconName = 'play' | 'refresh' | 'empty';

defineProps<{ name: IconName }>();
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path
      v-if="name === 'play'"
      d="M8 5v14l11-7z"
      fill="currentColor"
      stroke="none"
    />
    <template v-else-if="name === 'refresh'">
      <path d="M4 4v5h5M4 9a8 8 0 0 1 13.6-4.9" />
      <path d="M20 20v-5h-5M20 15a8 8 0 0 1-13.6 4.9" />
    </template>
    <template v-else-if="name === 'empty'">
      <rect
        x="3.5"
        y="6"
        width="17"
        height="14"
        rx="2.5"
      />
      <path d="M8 3.5v4M16 3.5v4M3.5 11h17" />
    </template>
  </svg>
</template>
