import process from 'node:process'
import { rollupBuild, testFixtures } from '@sxzz/test-utils'
import ViteVue from '@vitejs/plugin-vue'
import Oxc from 'unplugin-oxc/rollup'
import { describe, expect } from 'vitest'
import * as vueCompiler from 'vue/compiler-sfc'
import Vue from '../src/rollup'
import type { Options } from '../src/api'

async function getCode(file: string, plugin: any) {
  const bundle = await rollupBuild(file, [plugin, Oxc()], {
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
    logger: {},
  } as any)
  return {
    unplugin: Vue(opt),
    vite,
  }
}

describe('rollup', async () => {
  await testFixtures(
    'tests/fixtures/*.{vue,js,ts}',
    async (args, id) => {
      const { unplugin, vite } = createPlugins({
        root: process.cwd(),
        compiler: vueCompiler,
        isProduction: args.isProduction,
      })

      const viteCode = await getCode(id, vite)
      const unpluginCode = await getCode(id, unplugin)

      expect(viteCode).toBe(unpluginCode)
      return unpluginCode.replaceAll(
        /(["']__file["']\s*,\s*['"]).*?(['"])/g,
        (_, s1, s2) => `${s1}#FILE#${s2}`,
      )
    },
    {
      params: [['isProduction', [true, false]]],
      promise: true,
    },
  )
})
