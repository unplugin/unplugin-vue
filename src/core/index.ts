import fs from 'node:fs'
import { createFilter } from 'vite'
import { createUnplugin } from 'unplugin'
import { resolveCompiler } from '../core/compiler'
import { getResolvedScript } from '../core/script'
import { transformMain } from '../core/main'
import { transformTemplateAsModule } from '../core/template'
import { transformStyle } from '../core/style'
import { EXPORT_HELPER_ID, helperCode } from '../core/helper'
import { getDescriptor, getSrcDescriptor } from './utils/descriptorCache'
import { parseVueRequest } from './utils/query'
import { handleHotUpdate } from './handleHotUpdate'
import type { UnpluginContext, UnpluginContextMeta } from 'unplugin'
import type { ViteDevServer } from 'vite'
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
  script?: Partial<Pick<SFCScriptCompileOptions, 'babelParserPlugins'>>
  template?: Partial<
    Pick<
      SFCTemplateCompileOptions,
      | 'compiler'
      | 'compilerOptions'
      | 'preprocessOptions'
      | 'preprocessCustomRequire'
      | 'transformAssetUrls'
    >
  >
  style?: Partial<Pick<SFCStyleCompileOptions, 'trim'>>

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

export type Context = UnpluginContext & UnpluginContextMeta

export type ResolvedOptions = Options &
  Required<
    Pick<
      Options,
      | 'include'
      | 'isProduction'
      | 'ssr'
      | 'sourceMap'
      | 'root'
      | 'customElement'
      | 'reactivityTransform'
      | 'compiler'
    >
  > & {
    /** Vite only */
    devServer?: ViteDevServer
    devToolsEnabled?: boolean
    cssDevSourcemap: boolean
  }

function resolveOptions(rawOptions: Options): ResolvedOptions {
  const root = rawOptions.root ?? process.cwd()
  return {
    ...rawOptions,
    include: rawOptions.include ?? /\.vue$/,
    isProduction:
      rawOptions.isProduction ?? process.env.NODE_ENV === 'production',
    ssr: rawOptions.ssr ?? false,
    sourceMap: rawOptions.sourceMap ?? true,
    root,
    customElement: rawOptions.customElement ?? /\.ce\.vue$/,
    reactivityTransform: rawOptions.reactivityTransform ?? false,
    compiler: rawOptions.compiler as any, // to be set in buildStart
    devToolsEnabled: process.env.NODE_ENV !== 'production',
    cssDevSourcemap: false,
  }
}

export default createUnplugin((rawOptions: Options = {}, meta) => {
  let options = resolveOptions(rawOptions)
  const { include, exclude, customElement, reactivityTransform } = options

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

  return {
    name: 'unplugin-vue',

    vite: {
      handleHotUpdate(ctx) {
        if (!filter(ctx.file)) {
          return
        }
        return handleHotUpdate(ctx, options)
      },

      config(config) {
        return {
          define: {
            __VUE_OPTIONS_API__: config.define?.__VUE_OPTIONS_API__ ?? true,
            __VUE_PROD_DEVTOOLS__:
              config.define?.__VUE_PROD_DEVTOOLS__ ?? false,
          },
          ssr: {
            external: config.legacy?.buildSsrCjsExternalHeuristics
              ? ['vue', '@vue/server-renderer']
              : [],
          },
        }
      },

      configResolved(config) {
        options = {
          ...options,
          root: config.root,
          sourceMap:
            config.command === 'build' ? !!config.build.sourcemap : true,
          cssDevSourcemap: config.css?.devSourcemap ?? false,
          isProduction: config.isProduction,
          compiler: options.compiler || resolveCompiler(config.root),
          devToolsEnabled:
            !!config.define?.__VUE_PROD_DEVTOOLS__ || !config.isProduction,
        }
      },

      configureServer(server) {
        options.devServer = server
      },
    },

    buildStart() {
      if (!options.compiler) options.compiler = resolveCompiler(options.root)
    },

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

    loadInclude(id) {
      if (id === EXPORT_HELPER_ID) return true

      const { query } = parseVueRequest(id)
      return query.vue
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
          // handle <script> + <script setup> merge via compileScript()
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

    transformInclude(id) {
      const { filename, query } = parseVueRequest(id)
      if (query.raw) return false

      // Not Vue SFC and refTransform
      if (!filter(filename) && !query.vue && !refTransformFilter(filename))
        return false

      return true
    },

    transform(code, id) {
      const ssr = options.ssr
      const { filename, query } = parseVueRequest(id)
      if (!filter(filename) && !query.vue) {
        if (options.compiler.shouldTransformRef(code)) {
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
          Object.assign({}, this, meta),
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
            this,
            filename
          )
        }
      }
    },
  }
})
