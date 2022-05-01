import unplugin from '.'
// @ts-expect-error fix issue #42873
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { WebpackPluginInstance } from 'webpack'

export default unplugin.webpack
