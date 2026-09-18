<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import ToastMessage from '@/components/feedback/ToastMessage.vue';
import AppTopBar from '@/components/shell/AppTopBar.vue';
import LocalModeBanner from '@/components/shell/LocalModeBanner.vue';
import { useRefreshNotice } from '@/composables/useRefreshNotice';

const route = useRoute();
const showsAppShell = computed(() => route.name !== 'login');
const refreshNotice = useRefreshNotice();
</script>

<template>
  <div id="app">
    <div
      v-if="showsAppShell"
      class="shell"
    >
      <AppTopBar @refresh="refreshNotice.requestRefresh" />
      <ToastMessage
        :message="refreshNotice.message.value"
        @dismissed="refreshNotice.dismiss"
      />
      <main id="content">
        <LocalModeBanner />
        <RouterView />
      </main>
    </div>
    <RouterView v-else />
  </div>
</template>

<style scoped>
.shell {
    width: min(100%, 860px);
    margin: 0 auto;
}

#content {
    padding: 0 var(--gutter) calc(env(safe-area-inset-bottom) + 24px);
}
</style>
