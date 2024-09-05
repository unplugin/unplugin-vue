import process from 'node:process'
import { rolldownBuild, rollupBuild, testFixtures } from '@sxzz/test-utils'
import ViteVue from '@vitejs/plugin-vue'
import esbuild from 'rollup-plugin-esbuild'
import { describe, expect } from 'vitest'
import * as vueCompiler from 'vue/compiler-sfc'
import Vue from '../src'
import type { Options } from '../src/api'
import type { Plugin as RolldownPlugin } from 'rolldown'
import type { Plugin } from 'rollup'

async function getRollupCode(file: string, plugin: Plugin) {
  const bundle = await rollupBuild(file, [plugin, esbuild({ format: 'esm' })], {
    external: ['vue'],
  })
  return bundle.snapshot
}

async function getRolldownCode(file: string, plugin: RolldownPlugin) {
  const bundle = await rolldownBuild(file, [plugin], {
    external: ['vue'],
  })
  return bundle.snapshot
}

function createPlugins(opt: Options & { root: string }) {
  const vite = ViteVue(opt)
  // @ts-expect-error
  vite.configResolved!({
    root: opt.root,
    command: 'build',
    isProduction: opt.isProduction,
    build: {
      sourcemap: false,
    },
    define: {},
  } as any)
  return {
    rollup: Vue.rollup(opt),
    rolldown: Vue.rolldown(opt),
    vite,
  }
}

describe('rollup', async () => {
  await testFixtures(
    'tests/fixtures/*.{vue,js,ts}',
    async (args, id) => {
      const { rollup, rolldown, vite } = createPlugins({
        root: process.cwd(),
        compiler: vueCompiler,
        isProduction: args.isProduction,
      })

      const viteCode = await getRollupCode(id, vite)
      const rollupCode = await getRollupCode(id, rollup)
      const rolldownCode = await getRolldownCode(id, rolldown)

      expect(viteCode).toBe(rollupCode)
      // expect(rollupCode).toBe(rolldownCode)
      expect(rolldownCode).matchSnapshot()
      return rollupCode.replaceAll(JSON.stringify(id), "'#FILE#'")
    },
    {
      params: [['isProduction', [true, false]]],
      promise: true,
    },
  )
})
