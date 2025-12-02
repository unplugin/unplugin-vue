/**
 * This entry file is for Vite plugin.
 *
 * @module
 */

import {} from 'unplugin'
import unplugin from './index'

/**
 * Vite plugin
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import Starter from 'unplugin-vue/vite'
 *
 * export default defineConfig({
 *   plugins: [Starter()],
 * })
 * ```
 */
const vite = unplugin.vite as typeof unplugin.vite
export default vite
export { vite as 'module.exports' }
