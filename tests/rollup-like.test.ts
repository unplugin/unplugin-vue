import path from 'node:path'
import process from 'node:process'
import { rolldownBuild, rollupBuild, testFixtures } from '@sxzz/test-utils'
import ViteVue from '@vitejs/plugin-vue'
import Oxc from 'unplugin-oxc/rollup'
import { describe, expect } from 'vitest'
import * as vueCompiler from 'vue/compiler-sfc'
import Vue from '../src/rollup.ts'
import type { Options } from '../src/api.ts'

async function getCode(
  bundler: 'rollup' | 'rolldown',
  file: string,
  plugins: any[],
) {
  if (bundler === 'rollup') {
    return (
      await rollupBuild(
        file,
        [...plugins, Oxc()],
        { external: ['vue'] },
        { sourcemap: false },
      )
    ).snapshot
  }

  return (
    await rolldownBuild(
      file,
      plugins,
      { external: ['vue'] },
      { sourcemap: false, minify: true },
    )
  ).snapshot
}

// emulates vite:resolve, which resolves SFC-relative sub-requests before @vitejs/plugin-vue
const ViteResolveShim = {
  name: 'vite-resolve-shim',
  resolveId: (id: string, importer?: string) =>
    importer && id.startsWith('.') && id.includes('?vue')
      ? path.resolve(path.dirname(importer), id)
      : undefined,
}

// stands in for style/custom block plugins and records the SFC's src imports
function PostVue(srcImports: string[]) {
  return {
    name: 'post-vue',
    transform(code: string, id: string) {
      if (id.endsWith('.vue')) {
        srcImports.push(...(code.match(/[^"']+\?vue&[^"']*&src=[^"']*/g) ?? []))
      } else if (id.includes('type=style')) {
        return {
          code: `export default ${JSON.stringify(code)}`,
          moduleType: 'js',
        }
      } else if (id.includes('type=docs')) {
        return {
          code: `export default (c) => { c.__docs = ${JSON.stringify(code)} }`,
          moduleType: 'js',
        }
      }
    },
  }
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

      const unpluginSrc: string[] = []
      const viteSrc: string[] = []
      const unpluginCode = await getCode(bundler, id, [
        unplugin,
        PostVue(unpluginSrc),
      ])
      const viteCode = await getCode(bundler, id, [
        ViteResolveShim,
        vite,
        PostVue(viteSrc),
      ])
      expect(viteCode).toBe(unpluginCode)
      // the bundles can't tell relative from absolute src imports
      expect(unpluginSrc).toEqual(viteSrc)
      if (id.includes('sfc-src')) expect(unpluginSrc).not.toHaveLength(0)

      // CRLF checkouts change escaped line endings and the production scope id
      const scopeId = /data-v-([\da-f]{8})/.exec(unpluginCode)?.[1]
      const snapshot = unpluginCode
        .replaceAll(
          /(["']__file["']\s*,\s*['"]).*?(['"])/g,
          (_, s1, s2) => `${s1}#FILE#${s2}`,
        )
        .replaceAll(String.raw`\r\n`, String.raw`\n`)
      return scopeId ? snapshot.replaceAll(scopeId, '#ID#') : snapshot
    },
    {
      params: [['isProduction', [true, false]]],
      promise: true,
      snapshot: bundler === 'rollup',
    },
  )
})
