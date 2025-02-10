// @ts-check

import HtmlPlugin from '@chialab/esbuild-plugin-html'
import { build } from 'esbuild'
import Vue from 'unplugin-vue/esbuild'

await build({
  entryPoints: ['index.html'],
  bundle: true,
  outdir: 'dist',
  format: 'esm',
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  assetNames: '[name]-[hash]',
  chunkNames: '[name]-[hash]',
  plugins: [
    Vue({
      style: {
        preprocessLang: 'scss',
      },
    }),
    HtmlPlugin(),
  ],
})
