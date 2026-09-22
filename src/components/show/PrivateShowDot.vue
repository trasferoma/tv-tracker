<script setup lang="ts">
defineProps<{
    profileId: string;
}>();
</script>

<template>
  <span
    class="private-dot"
    :class="`private-dot--${profileId}`"
    role="img"
    aria-label="Solo per te"
  />
</template>

<style scoped>
.private-dot {
    display: inline-block;
    width: 9px;
    height: 9px;
    margin-left: 8px;
    border-radius: 50%;
}

.private-dot--fabio {
    background: var(--fabio);
}

.private-dot--irene {
    background: var(--irene);
}
</style>
