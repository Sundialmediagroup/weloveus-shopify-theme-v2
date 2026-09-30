import { defineConfig } from 'vite'
import shopify from 'vite-plugin-shopify'

export default defineConfig({
  plugins: [
    shopify({
      sourceCodeDir: 'frontend',
      entrypointsDir: 'frontend/entrypoints',
    }),
  ],
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
      },
    },
  },
  build: {
    // Söhne lives in assets/ and is referenced by snippets/fonts.liquid,
    // so the directory can never be wiped between builds.
    emptyOutDir: false,

    rollupOptions: {
      output: {
        // Unhashed, stable filenames. Shopify's `asset_url` filter appends its
        // own content-based `?v=` parameter, so cache busting is already
        // handled at the CDN — a hash in the filename adds nothing and costs
        // a lot: every build minted a new file that `emptyOutDir: false` could
        // never clean up (116 dead bundles had accumulated), and every build
        // invalidated the filename the theme was pointing at.
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
})
