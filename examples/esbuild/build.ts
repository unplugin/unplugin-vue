import { build } from 'esbuild'
import Vue from 'unplugin-vue/esbuild'
  ; (async () => {
    await build({
      entryPoints: ['src/main.ts'],
      bundle: true,
      outfile: 'dist/main.js',
      format: 'esm',
      define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
      },
      plugins: [
        Vue({
          style: {
            // @ts-ignore
            preprocessLang: 'scss',
          },
        }),
      ],
    })
  })()
