/**
 * This entry file is for Rspack plugin.
 *
 * @module
 */

import unplugin from './index'

/**
 * Rspack plugin
 *
 * @example
 * ```js
 * // rspack.config.js
 * import Vue from 'unplugin-vue/rspack'
 *
 * default export {
 *  plugins: [Vue()],
 * }
 * ```
 */
const rspack = unplugin.rspack as typeof unplugin.rspack
export default rspack
export { rspack as 'module.exports' }
