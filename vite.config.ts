/// <reference types="vitest/config" />
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * BT_TARGET=artifact builds a hosted preview for the claude.ai Artifact viewer: relative asset
 * paths, in-memory routing, no service worker (the viewer frame does not support them) and file
 * saves through the viewer's `downloads` capability. The default target is the installable PWA.
 */
const ARTIFACT = process.env.BT_TARGET === 'artifact';

/**
 * Public path of the PWA. '/' by default; BT_BASE=/repo-name/ when the site is served from a
 * sub-path (GitHub Pages project sites: https://<user>.github.io/<repo-name>/).
 */
const BASE = ARTIFACT ? './' : `/${(process.env.BT_BASE ?? '/').replace(/^\/+|\/+$/g, '')}/`.replace('//', '/');

/**
 * Strict Content-Security-Policy for production builds: no third-party origins at all,
 * so no analytics, tracking or remote calls can be added accidentally.
 * (Not applied in dev because Vite's HMR preamble is an inline script.)
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'burn-tool-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  };
}

export default defineConfig({
  base: BASE,
  define: { 'import.meta.env.VITE_TARGET': JSON.stringify(ARTIFACT ? 'artifact' : 'pwa') },
  plugins: [
    ...(ARTIFACT ? [] : [cspPlugin()]),
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt' so an update never reloads the page in the middle of data entry.
      disable: ARTIFACT,
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/*.png', 'icons/*.svg', 'models/*'],
      manifest: {
        id: BASE,
        name: 'BurnMatrix — Burn Assessment & ICU Management',
        short_name: 'BurnMatrix',
        description:
          'Local-first, offline-capable burn assessment and ICU management decision-support tool. Patient data stays on this device.',
        theme_color: '#0b1730',
        background_color: '#0b1730',
        display: 'standalone',
        orientation: 'any',
        start_url: BASE,
        scope: BASE,
        categories: ['medical', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Only the static application shell and static assets are precached.
        // Patient data lives exclusively in IndexedDB and is never placed in Cache Storage.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,glb,gltf,webmanifest}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: [
      ...(ARTIFACT ? [{ find: 'virtual:pwa-register/react', replacement: path.resolve(rootDir, 'src/app/providers/pwa-stub.ts') }] : []),
      { find: '@', replacement: path.resolve(rootDir, 'src') },
    ],
  },
  build: {
    outDir: ARTIFACT ? 'dist-artifact' : 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/](three|@react-three)[\\/]/.test(id)) return 'vendor-3d';
          if (/[\\/](jspdf|jspdf-autotable|html2canvas|canvg|dompurify)[\\/]/.test(id)) return 'vendor-pdf';
          if (/[\\/](recharts|d3-[a-z-]+|victory-vendor)[\\/]/.test(id)) return 'vendor-charts';
          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/engines/**', 'src/database/**', 'src/features/settings/backup/**'],
    },
  },
});
