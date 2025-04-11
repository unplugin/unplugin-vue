/**
 * This entry file is for esbuild plugin. Requires esbuild >= 0.15
 *
 * @module
 */

import unplugin from './index'

/**
 * Esbuild plugin
 *
 * @example
 * ```ts
 * import { build } from 'esbuild'
 * import Vue from 'unplugin-vue/esbuild'
 * 
 * build({ plugins: [Vue()] })
```
 */
const esbuild = unplugin.esbuild as typeof unplugin.esbuild
export default esbuild
export { esbuild as 'module.exports' }
