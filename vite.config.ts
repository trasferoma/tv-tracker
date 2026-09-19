import type { IncomingMessage } from 'node:http';
import { fileURLToPath, URL } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { loadEnv, type HttpProxy, type ProxyOptions } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

import { resolveTmdbTargetPath, TMDB_API_ORIGIN, TMDB_PROXY_PATH } from './src/catalog/tmdbRequest';

const srcDirUrl = new URL('./src', import.meta.url);
const ACCENT_COLOR = '#087f8c';
const BACKGROUND_COLOR = '#f3f8fb';
const TMDB_IMAGE_ORIGIN = 'https://image.tmdb.org';
const TMDB_POSTER_CACHE_MAX_ENTRIES = 200;
const TMDB_POSTER_CACHE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

// Workbox incorpora `urlPattern` chiamando `.toString()` sul valore: una funzione che
// chiude su una costante di questo file diventerebbe, nel service worker generato, un
// riferimento a una variabile inesistente (ReferenceError a runtime). Un'espressione
// regolare non ha questo problema: si serializza come pattern letterale autonomo.
const escapedTmdbProxyPath = escapeForRegExp(TMDB_PROXY_PATH);
const escapedTmdbImageOrigin = escapeForRegExp(TMDB_IMAGE_ORIGIN);
const TMDB_PROXY_ROUTE_PATTERN = new RegExp(`^https?://[^/]+${escapedTmdbProxyPath}`);
const TMDB_IMAGE_ROUTE_PATTERN = new RegExp(`^${escapedTmdbImageOrigin}/`);

function escapeForRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const tmdbProxyOptions = buildTmdbProxyOptions(env.TMDB_READ_ACCESS_TOKEN);

    return {
        plugins: [vue(), buildPwaPlugin()],
        resolve: {
            alias: {
                '@': fileURLToPath(srcDirUrl)
            }
        },
        server: {
            proxy: {
                [TMDB_PROXY_PATH]: tmdbProxyOptions
            }
        },
        test: {
            environment: 'node',
            include: ['src/**/*.spec.ts'],
            setupFiles: ['./vitest.setup.ts']
        }
    };
});

function buildPwaPlugin() {
    return VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.png', 'apple-touch-icon.png'],
        manifest: {
            name: 'TV Tracker',
            short_name: 'TV Tracker',
            description: 'Tracciamento condiviso delle serie TV seguite da Fabio e Irene, offline-first con TMDB.',
            lang: 'it',
            display: 'standalone',
            theme_color: ACCENT_COLOR,
            background_color: BACKGROUND_COLOR,
            icons: [
                { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
            ]
        },
        workbox: {
            globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
            navigateFallbackDenylist: [TMDB_PROXY_ROUTE_PATTERN],
            runtimeCaching: [
                {
                    urlPattern: TMDB_PROXY_ROUTE_PATTERN,
                    handler: 'NetworkOnly'
                },
                {
                    urlPattern: TMDB_IMAGE_ROUTE_PATTERN,
                    handler: 'CacheFirst',
                    options: {
                        cacheName: 'tmdb-posters',
                        expiration: {
                            maxEntries: TMDB_POSTER_CACHE_MAX_ENTRIES,
                            maxAgeSeconds: TMDB_POSTER_CACHE_MAX_AGE_SECONDS
                        },
                        cacheableResponse: {
                            statuses: [0, 200]
                        }
                    }
                }
            ]
        }
    });
}

function buildTmdbProxyOptions(tmdbReadAccessToken: string | undefined): ProxyOptions {
    return {
        target: TMDB_API_ORIGIN,
        changeOrigin: true,
        bypass: bypassDisallowedTmdbRequest,
        rewrite: rewriteToTmdbPath,
        configure: (proxy) => registerTmdbAuthorization(proxy, tmdbReadAccessToken)
    };
}

function bypassDisallowedTmdbRequest(req: IncomingMessage): false | undefined {
    const incomingUrl = new URL(req.url ?? '', 'http://localhost');
    const targetPath = resolveTmdbTargetPath(incomingUrl.searchParams);
    return targetPath === undefined ? false : undefined;
}

function rewriteToTmdbPath(incomingPath: string): string {
    const incomingUrl = new URL(incomingPath, 'http://localhost');
    const targetPath = resolveTmdbTargetPath(incomingUrl.searchParams);
    if (targetPath === undefined) {
        throw new Error('Richiesta TMDB non valida oltre il controllo di bypass.');
    }
    return targetPath;
}

function registerTmdbAuthorization(proxy: HttpProxy.Server, tmdbReadAccessToken: string | undefined): void {
    proxy.on('proxyReq', (proxyReq) => {
        if (tmdbReadAccessToken !== undefined) {
            proxyReq.setHeader('Authorization', `Bearer ${tmdbReadAccessToken}`);
        }
    });
}
