import path from 'node:path'
import { build } from 'vite'
import { expect, test } from 'vitest'
import * as vueCompiler from 'vue/compiler-sfc'
import Vue from '../src/vite.ts'

test('vite resolves src blocks', async () => {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [Vue({ compiler: vueCompiler })],
    build: {
      write: false,
      lib: {
        entry: path.resolve('tests/fixtures/sfc-src.vue'),
        formats: ['es'],
        fileName: 'index',
      },
      rolldownOptions: { external: ['vue'] },
    },
  })
  const code = [result]
    .flat()
    .flatMap((r) => ('output' in r ? r.output : []))
    .map((file) => (file.type === 'chunk' ? file.code : ''))
    .join('\n')
  expect(code).toContain('Hello World')
})
