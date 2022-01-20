import { resolve } from 'path'
import { describe, it, expect } from 'vitest'
import { build } from 'esbuild'
import glob from 'fast-glob'
import * as vueCompiler from 'vue/compiler-sfc'
import Vue from '../src/esbuild'

describe('transform', () => {
  describe('fixtures', async () => {
    const root = resolve(__dirname, '..')
    const files = await glob('tests/fixtures/!(sfc-src)*.{vue,js,ts}', {
      cwd: root,
      onlyFiles: true,
    })

    for (const file of files) {
      describe(file.replaceAll('\\', '/'), async () => {
        const filepath = resolve(root, file)
        for (const isProduction of [true, false]) {
          it(`isProduction is ${isProduction}`, async () => {
            const result = await build({
              entryPoints: [filepath],
              plugins: [
                Vue({
                  root,
                  compiler: vueCompiler,
                  reactivityTransform: true,
                  isProduction,
                }),
              ],
              write: false,
            })
            const codes = result.outputFiles
              .map((file) => new TextDecoder('utf-8').decode(file.contents))
              .join('\n')
            expect(codes).toMatchSnapshot()
          })
        }
      })
    }
  })
})
