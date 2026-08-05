import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],

    /*
     * AND-06: assets must resolve relatively. AmbientDreamService loads the
     * bundle from file:///android_asset/public/index.html, where Vite's default
     * absolute "/assets/..." paths resolve to the filesystem root and 404. The
     * screensaver rendered a blank black screen as a result.
     */
    base: './',

    /*
     * BUILD-04: the previous config did
     *   define: { 'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY) }
     * which inlines a live API key as a string literal into the client bundle
     * that ships inside the APK. Anyone can extract it with `strings`. The key
     * was never read by any source file, so this was pure liability. Removed
     * along with the loadEnv import.
     *
     * If a server-side key is ever needed, it must be proxied, never inlined.
     */

    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },

    build: {
      /*
       * BUILD-06: no target was specified, so Vite used its default modern
       * baseline. Google TV devices ship notably older Chromium builds than
       * phones and can hard-fail on newer syntax. chrome87 covers the Android
       * 10/11-era TV WebViews still in the field.
       */
      target: ['chrome87', 'es2020'],
      sourcemap: true,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            motion: ['motion'],
            icons: ['lucide-react'],
          },
        },
      },
    },

    server: {
      host: true,
      port: 3000,
      // HMR is disabled in AI Studio via the DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
    },

    test: {
      environment: 'jsdom',
      include: ['tests/**/*.test.ts'],
    },
  };
});
