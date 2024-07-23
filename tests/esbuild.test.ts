import process from 'node:process'
import { testFixtures } from '@sxzz/test-utils'
import { build } from 'esbuild'
import { describe, expect } from 'vitest'
import * as vueCompiler from 'vue/compiler-sfc'
import Vue from '../src/esbuild'

describe('esbuild', async () => {
  await testFixtures(
    'tests/fixtures/!(sfc-src)*.{vue,js,ts}',
    async (args, id) => {
      const result = await build({
        entryPoints: [id],
        bundle: true,
        external: ['vue'],
        treeShaking: true,
        format: 'esm',
        plugins: [
          Vue({
            root: process.cwd(),
            compiler: vueCompiler,
            isProduction: args.isProduction,
          }),
        ],
        write: false,
      })
      const codes = result.outputFiles.map((file) => file.text).join('\n')
      expect(
        codes
          .replaceAll(JSON.stringify(id), '"#FILE#"')
          .replaceAll('\0', '[NULL]'),
      ).toMatchSnapshot()
    },
    {
      params: [['isProduction', [true, false]]],
      promise: true,
    },
  )
})
