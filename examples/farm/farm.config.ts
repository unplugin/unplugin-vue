import { existsSync, readFileSync } from 'node:fs'
import { defineConfig } from '@farmfe/core'
import Vue from 'unplugin-vue/farm'

import ViteVue from 'unplugin-vue/vite'
export default defineConfig({
  // plugins: [Vue()],
  plugins: [Vue(), test2()],
  // vitePlugins: [ViteVue()],
  compilation: {
    // persistentCache: false,
    progress: false,
  },
})

function test2() {
  return {
    name: '456',
    priority: -100,
    load: {
      filters: {
        resolvedPaths: ['.vue'],
      },
      executor: async (param, context, hookContext) => {
        const content = readFileSync(param.resolvedPath, 'utf-8')
        return {
          content,
          moduleType: 'js',
        }
      },
    },
  }
}

function test3() {
  return {
    name: '123',
  }
}
