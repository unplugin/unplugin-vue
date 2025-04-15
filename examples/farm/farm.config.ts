// import Vue from "unplugin-vue/vite";
import fs from 'node:fs'
import { defineConfig } from '@farmfe/core'
import Vue from 'unplugin-vue/farm'

export default defineConfig({
  plugins: [Vue(), base()],
  compilation: {
    progress: false,
    persistentCache: false,
  },
})

function base() {
  return {
    name: 'farm-load-vue-module-type',
    priority: -100,
    load: {
      filters: {
        resolvedPaths: ['.vue'],
      },
      executor: (param) => {
        const content = fs.readFileSync(param.resolvedPath, 'utf-8')
        return {
          content,
          moduleType: 'js',
        }
      },
    },
  }
}
