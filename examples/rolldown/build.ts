import { build } from 'rolldown'
import Vue from 'unplugin-vue/rolldown'

await build({
  input: ['./src/main.ts'],
  external: ['vue'],
  plugins: [Vue()],
  output: {
    dir: 'dist',
    format: 'esm',
    cleanDir: true,
  },
})
