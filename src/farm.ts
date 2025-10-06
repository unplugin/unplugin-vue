import fs from 'node:fs'
import { plugin, type Options } from './core'
import type { JsPlugin, PluginLoadHookParam } from '@farmfe/core'

const createFarmVuePlugins = (options?: Options): JsPlugin[] => {
  const vuePlugin = plugin.farm(options)

  const vueLoadPlugin = {
    name: 'farm-load-vue-module-type',
    priority: -100,
    load: {
      filters: {
        resolvedPaths: ['.vue'],
      },
      executor: (param: PluginLoadHookParam) => {
        const content = fs.readFileSync(param.resolvedPath, 'utf8')
        return {
          content,
          moduleType: 'js',
        }
      },
    },
  }
  return [vuePlugin, vueLoadPlugin]
}

export default createFarmVuePlugins
