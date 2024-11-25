import { defineConfig } from '@farmfe/core'
import Vue from 'unplugin-vue/vite'

export default defineConfig({
  vitePlugins: [Vue()],
  compilation: {
    persistentCache: false,
    progress: false,
  },
})
