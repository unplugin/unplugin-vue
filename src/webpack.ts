/**
 * This entry file is for webpack plugin.
 *
 * @module
 */

import unplugin from './index'

/**
 * Webpack plugin
 *
 * @example
 * ```js
 * // webpack.config.js
 * import Vue from 'unplugin-vue/webpack'
 *
 * default export {
 *  plugins: [Vue()],
 * }
 * ```
 */
const webpack = unplugin.webpack as typeof unplugin.webpack
export default webpack
export { webpack as 'module.exports' }
