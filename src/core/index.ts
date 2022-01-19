import fs from 'fs'
import { createFilter } from '@rollup/pluginutils'
import { createUnplugin } from 'unplugin'
import { resolveCompiler } from '../core/compiler'
import { getResolvedScript } from '../core/script'
import { transformMain } from '../core/main'
import { transformTemplateAsModule } from '../core/template'
import { transformStyle } from '../core/style'
import { EXPORT_HELPER_ID, helperCode } from '../core/helper'
import { getDescriptor, getSrcDescriptor } from './utils/descriptorCache'
import { parseVueRequest } from './utils/query'
// eslint-disable-next-line import/no-duplicates
import type * as _compiler from 'vue/compiler-sfc'
import type {
  SFCBlock,
  SFCScriptCompileOptions,
  SFCStyleCompileOptions,
  SFCTemplateCompileOptions,
  // eslint-disable-next-line import/no-duplicates
} from 'vue/compiler-sfc'

export { parseVueRequest, VueQuery } from './utils/query'

export interface Options {
  include?: string | RegExp | (string | RegExp)[]
  exclude?: string | RegExp | (string | RegExp)[]

  isProduction?: boolean
  ssr?: boolean
  sourceMap?: boolean
  root?: string

  // options to pass on to vue/compiler-sfc
  script?: Partial<SFCScriptCompileOptions>
  template?: Partial<SFCTemplateCompileOptions>
  style?: Partial<SFCStyleCompileOptions>

  /**
   * Transform Vue SFCs into custom elements.
   * - `true`: all `*.vue` imports are converted into custom elements
   * - `string | RegExp`: matched files are converted into custom elements
   *
   * @default /\.ce\.vue$/
   */
  customElement?: boolean | string | RegExp | (string | RegExp)[]

  /**
   * Enable Vue reactivity transform (experimental).
   * https://github.com/vuejs/vue-next/tree/master/packages/reactivity-transform
   * - `true`: transform will be enabled for all vue,js(x),ts(x) files except
   *           those inside node_modules
   * - `string | RegExp`: apply to vue + only matched files (will include
   *                      node_modules, so specify directories in necessary)
   * - `false`: disable in all cases
   *
   * @default false
   */
  reactivityTransform?: boolean | string | RegExp | (string | RegExp)[]

  /**
   * Use custom compiler-sfc instance. Can be used to force a specific version.
   */
  compiler?: typeof _compiler
}

export interface ResolvedOptions extends Options {
  compiler: typeof _compiler
  root: string
  ssr: boolean
  sourceMap: boolean
  isProduction: boolean
}

const vuePlugin = createUnplugin((rawOptions: Options = {}) => {
  const {
    include = /\.vue$/,
    exclude,
    customElement = /\.ce\.vue$/,
    reactivityTransform = false,
  } = rawOptions

  const filter = createFilter(include, exclude)

  const customElementFilter =
    typeof customElement === 'boolean'
      ? () => customElement
      : createFilter(customElement)

  const refTransformFilter =
    reactivityTransform === false
      ? () => false
      : reactivityTransform === true
      ? createFilter(/\.(j|t)sx?$/, /node_modules/)
      : createFilter(reactivityTransform)

  const options: ResolvedOptions = {
    isProduction: process.env.NODE_ENV === 'production',
    ...rawOptions,
    include,
    exclude,
    customElement,
    reactivityTransform,
    compiler: rawOptions.compiler || resolveCompiler(process.cwd()),
    sourceMap: rawOptions.sourceMap ?? true,
    root: rawOptions.root ?? process.cwd(),
    ssr: rawOptions.ssr ?? false,
  }

  return {
    name: 'unplugin-vue',

    async resolveId(id) {
      // component export helper
      if (id === EXPORT_HELPER_ID) {
        return id
      }
      // serve sub-part requests (*?vue) as virtual modules
      if (parseVueRequest(id).query.vue) {
        return id
      }
    },

    load(id) {
      const ssr = options.ssr
      if (id === EXPORT_HELPER_ID) {
        return helperCode
      }

      const { filename, query } = parseVueRequest(id)
      // select corresponding block for sub-part virtual modules
      if (query.vue) {
        if (query.src) {
          return fs.readFileSync(filename, 'utf-8')
        }
        const descriptor = getDescriptor(filename, options)!
        let block: SFCBlock | null | undefined
        if (query.type === 'script') {
          // handle <scrip> + <script setup> merge via compileScript()
          block = getResolvedScript(descriptor, ssr)
        } else if (query.type === 'template') {
          block = descriptor.template!
        } else if (query.type === 'style') {
          block = descriptor.styles[query.index!]
        } else if (query.index != null) {
          block = descriptor.customBlocks[query.index]
        }
        if (block) {
          return {
            code: block.content,
            map: block.map as any,
          }
        }
      }
    },

    transform(code, id) {
      const ssr = options.ssr
      const { filename, query } = parseVueRequest(id)
      if (query.raw) {
        return
      }
      if (!filter(filename) && !query.vue) {
        if (
          !query.vue &&
          refTransformFilter(filename) &&
          options.compiler.shouldTransformRef(code)
        ) {
          return options.compiler.transformRef(code, {
            filename,
            sourceMap: true,
          })
        }
        return
      }

      if (!query.vue) {
        // main request
        return transformMain(
          code,
          filename,
          options,
          this,
          ssr,
          customElementFilter(filename)
        )
      } else {
        // sub block request
        const descriptor = query.src
          ? getSrcDescriptor(filename, query)!
          : getDescriptor(filename, options)!

        if (query.type === 'template') {
          return transformTemplateAsModule(code, descriptor, options, this, ssr)
        } else if (query.type === 'style') {
          return transformStyle(
            code,
            descriptor,
            Number(query.index),
            options,
            this
          )
        }
      }
    },
  }
})
export default vuePlugin
