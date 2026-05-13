import path from 'node:path'
import process from 'node:process'
import { rolldownBuild, rollupBuild } from '@sxzz/test-utils'
import { describe, expect, test } from 'vitest'
import * as vueCompiler from 'vue/compiler-sfc'
import Vue from '../src/rollup.ts'

describe.each(['rollup', 'rolldown'] as const)('%s', (bundler) => {
  // builds `code` as if it were the file `entry` in tests/fixtures
  function build(
    entry: string,
    code: string,
    external: string[] | ((id: string) => boolean) = ['vue'],
  ) {
    const id = path.resolve('tests/fixtures', entry)
    const plugins = [
      {
        name: 'virtual-entry',
        resolveId: (source: string) => (source === id ? id : undefined),
        load: (source: string) => (source === id ? code : undefined),
      },
      Vue({ root: process.cwd(), compiler: vueCompiler }),
    ]
    return bundler === 'rollup'
      ? rollupBuild(id, plugins, { external })
      : rolldownBuild(id, plugins, { external })
  }

  test('leaves unresolvable src as before', async () => {
    await expect(
      build(
        'missing-src.vue',
        `<template><div /></template>\n<style src="./does-not-exist.css"></style>`,
      ),
    ).rejects.toThrow(
      /ENOENT: no such file or directory, open '\.\/does-not-exist\.css'/,
    )
  })

  test('keeps external src external', async () => {
    const { snapshot } = await build(
      'external-src.vue',
      `<template><div /></template>\n<style src="ext-pkg/style.css"></style>`,
      (id) => id === 'vue' || id === 'ext-pkg/style.css',
    )
    expect(snapshot).toContain(
      'ext-pkg/style.css?vue&type=style&index=0&src=true&lang.css',
    )
  })

  test('resolves src against an importer with query', async () => {
    const { snapshot } = await build(
      'entry.js?from=a/b',
      `import comp from './src-script.ts?vue&type=script&src=true&lang.ts'\nexport default comp`,
    )
    expect(snapshot).toContain('defineComponent')
  })
})
