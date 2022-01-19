import { resolve } from 'path'
import { describe, it, expect } from 'vitest'
import { rollup } from 'rollup'
import glob from 'fast-glob'
import ViteVue from '@vitejs/plugin-vue'
import * as vueCompiler from 'vue/compiler-sfc'
import Vue from '../src/rollup'
import type { Options } from '../src'

async function getCode(file: string, plugin: any) {
  const bundle = await rollup({
    input: [file],
    external: ['vue'],
    plugins: [plugin],
  })
  const output = await bundle.generate({ format: 'esm' })
  return output.output
    .map((file) => {
      if (file.type === 'chunk') {
        return file.code
      } else {
        return file.fileName
      }
    })
    .join('\n')
}

function createPlugins(opt: Options) {
  const vite = ViteVue({
    reactivityTransform: true,
    compiler: opt.compiler!,
  })
  vite.configResolved!({
    root: opt.root!,
    command: 'build',
    isProduction: true,
    build: {
      sourcemap: false,
    },
  } as any)
  return {
    unplugin: Vue(opt),
    vite,
  }
}

describe('transform', () => {
  describe('fixtures', async () => {
    const root = resolve(__dirname, '..')
    const files = await glob('test/fixtures/*.{vue,js,ts}', {
      cwd: root,
      onlyFiles: true,
    })

    for (const file of files) {
      describe(file.replaceAll('\\', '/'), () => {
        const filepath = resolve(root, file)

        for (const isProduction of [true, false]) {
          it(`isProduction is ${isProduction}`, async () => {
            const { unplugin, vite } = createPlugins({
              root,
              compiler: vueCompiler,
              reactivityTransform: true,
              isProduction: true,
            })

            const viteCode = await getCode(filepath, vite)
            const unpluginCode = await getCode(filepath, unplugin)
            expect(unpluginCode).toMatchSnapshot()

            expect(viteCode).toBe(unpluginCode)
          })
        }
      })
    }
  })
})
