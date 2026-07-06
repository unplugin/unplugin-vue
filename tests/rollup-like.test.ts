import process from 'node:process'
import { rolldownBuild, rollupBuild, testFixtures } from '@sxzz/test-utils'
import ViteVue from '@vitejs/plugin-vue'
import Oxc from 'unplugin-oxc/rollup'
import { describe, expect } from 'vitest'
import * as vueCompiler from 'vue/compiler-sfc'
import Vue from '../src/rollup'
import type { Options } from '../src/api'

async function getCode(
  bundler: 'rollup' | 'rolldown',
  file: string,
  plugin: any,
) {
  if (bundler === 'rollup') {
    return (
      await rollupBuild(
        file,
        [plugin, Oxc()],
        { external: ['vue'] },
        { sourcemap: false },
      )
    ).snapshot
  }

  return (
    await rolldownBuild(
      file,
      [plugin],
      { external: ['vue'] },
      { sourcemap: false, minify: true },
    )
  ).snapshot
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

describe.each(['rollup', 'rolldown'] as const)('%s', async (bundler) => {
  await testFixtures(
    'tests/fixtures/*.{vue,js,ts}',
    async (args, id) => {
      const { unplugin, vite } = createPlugins({
        root: process.cwd(),
        compiler: vueCompiler,
        isProduction: args.isProduction,
      })

      const viteCode = await getCode(bundler, id, vite)
      const unpluginCode = await getCode(bundler, id, unplugin)

      expect(viteCode).toBe(unpluginCode)
      return unpluginCode.replaceAll(
        /(["']__file["']\s*,\s*['"]).*?(['"])/g,
        (_, s1, s2) => `${s1}#FILE#${s2}`,
      )
    },
    {
      params: [['isProduction', [true, false]]],
      promise: true,
      snapshot: bundler === 'rollup',
    },
  )
})
