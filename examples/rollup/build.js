import { rollup } from 'rollup'
import Oxc from 'unplugin-oxc/rollup'
import Vue from 'unplugin-vue/rollup'

const bundle = await rollup({
  input: ['./src/main.ts'],
  external: ['vue'],
  plugins: [Vue(), Oxc()],
})
await bundle.write({
  dir: 'dist',
  format: 'esm',
})
