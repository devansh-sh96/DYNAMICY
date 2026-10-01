import { defineConfig } from 'electron-vite'
import { resolve } from 'path'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].js',
          chunkFileNames: '[name]-[hash].js'
        },
        input: {
          index: resolve('src/main/index.ts'),
          'system-monitor': resolve('src/main/system-monitor.ts'),
          'gemini-worker': resolve('src/main/ai/gemini-worker.ts')
        },
        external: [
          'electron',
          /^electron\/.+/,
          'better-sqlite3',
          'systeminformation',
        ]
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        external: [
          'electron',
          /^electron\/.+/
        ],
        output: {
          format: 'cjs',
          entryFileNames: '[name].js'
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer'),
        '@': resolve('src/renderer')
      }
    },
    build: {
      rollupOptions: {
        // framer-motion ships `"use client"` directives that Rollup reports as
        // "Module level directives cause errors when bundled". They are inert in a
        // packaged Electron renderer, so the warning is filtered to keep output clean.
        onwarn(warning, warn) {
          if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return
          warn(warning)
        }
      }
    }
  }
})
