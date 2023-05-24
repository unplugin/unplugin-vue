import { rollup } from 'rollup'
import Vue from 'unplugin-vue/rollup'
import esbuild from 'rollup-plugin-esbuild'

const bundle = await rollup({
  input: ['./src/main.ts'],
  external: ['vue'],
  plugins: [Vue(), esbuild({ format: 'esm' })],
})
await bundle.write({
  dir: 'dist',
  format: 'esm',
})
