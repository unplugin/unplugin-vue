import { defineConfig } from 'vite'
import Vue from 'unplugin-vue/vite'
import Inspect from 'vite-plugin-inspect'

export default defineConfig({
  plugins: [Vue(), Inspect()],
})
