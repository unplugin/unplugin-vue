/**
 * This entry file is for Rolldown plugin.
 *
 * @module
 */

import {} from 'unplugin'
import unplugin from './index'

/**
 * Rolldown plugin
 *
 * @example
 * ```ts
 * // rolldown.config.js
 * import Starter from 'unplugin-vue/rolldown'
 *
 * export default {
 *   plugins: [Starter()],
 * }
 * ```
 */
const rolldown = unplugin.rolldown as typeof unplugin.rolldown
export default rolldown
export { rolldown as 'module.exports' }
