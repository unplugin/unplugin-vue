import { rollup } from 'rollup'
import Vue from 'unplugin-vue/rollup'
;(async () => {
  const bundle = await rollup({
    input: ['./src/main.ts'],
    external: ['vue'],
    plugins: [Vue()],
  })
  await bundle.write({
    dir: 'dist',
    format: 'esm',
  })
})()
