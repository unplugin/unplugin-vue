import fs from 'node:fs'
import { type ViteDevServer, createFilter, normalizePath } from 'vite'
import {
  type UnpluginContext,
  type UnpluginContextMeta,
  createUnplugin,
} from 'unplugin'
import {
  type SFCBlock,
  type SFCScriptCompileOptions,
  type SFCStyleCompileOptions,
  type SFCTemplateCompileOptions,
  // eslint-disable-next-line import/no-duplicates
} from 'vue/compiler-sfc'
import { resolveCompiler } from '../core/compiler'
import { getResolvedScript, typeDepToSFCMap } from '../core/script'
import { transformMain } from '../core/main'
import { transformTemplateAsModule } from '../core/template'
import { transformStyle } from '../core/style'
import { EXPORT_HELPER_ID, helperCode } from '../core/helper'
import { version } from '../../package.json'
import {
  getDescriptor,
  getSrcDescriptor,
  getTempSrcDescriptor,
} from './utils/descriptorCache'
import { parseVueRequest } from './utils/query'
import { handleHotUpdate, handleTypeDepChange } from './handleHotUpdate'
// eslint-disable-next-line import/no-duplicates
import type * as _compiler from 'vue/compiler-sfc'

export { parseVueRequest, type VueQuery } from './utils/query'

export interface Options {
  include?: string | RegExp | (string | RegExp)[]
  exclude?: string | RegExp | (string | RegExp)[]

  isProduction?: boolean
  ssr?: boolean
  sourceMap?: boolean
  root?: string

  // options to pass on to vue/compiler-sfc
  script?: Partial<
    Pick<
      SFCScriptCompileOptions,
      | 'babelParserPlugins'
      | 'globalTypeFiles'
      | 'defineModel'
      | 'propsDestructure'
      | 'fs'
      | 'reactivityTransform'
      | 'hoistStatic'
    >
  >
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
   * https://vuejs.org/guide/extras/reactivity-transform.html
   * - `true`: transform will be enabled for all vue,js(x),ts(x) files except
   *           those inside node_modules
   * - `string | RegExp`: apply to vue + only matched files (will include
   *                      node_modules, so specify directories if necessary)
   * - `false`: disable in all cases
   *
   * @default false
   */
  reactivityTransform?: boolean | string | RegExp | (string | RegExp)[]

  /**
   * Use custom compiler-sfc instance. Can be used to force a specific version.
   */
  compiler?: typeof _compiler

  /**
   * @default true
   */
  inlineTemplate?: boolean
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
      | 'inlineTemplate'
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
    inlineTemplate: rawOptions.inlineTemplate ?? true,
  }
}

export default createUnplugin<Options | undefined, false>(
  (rawOptions = {}, meta) => {
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

    const api = {
      get options() {
        return options
      },
      set options(value) {
        options = value
      },
      version,
    }

    return {
      name: 'unplugin-vue',

      vite: {
        api,
        handleHotUpdate(ctx) {
          if (options.compiler.invalidateTypeCache) {
            options.compiler.invalidateTypeCache(ctx.file)
          }
          if (typeDepToSFCMap.has(ctx.file)) {
            return handleTypeDepChange(typeDepToSFCMap.get(ctx.file)!, ctx)
          }
          if (filter(ctx.file)) {
            return handleHotUpdate(ctx, options)
          }
        },

        config(config) {
          return {
            resolve: {
              dedupe: config.build?.ssr ? [] : ['vue'],
            },
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
              !!config.define!.__VUE_PROD_DEVTOOLS__ || !config.isProduction,
          }
        },

        configureServer(server) {
          options.devServer = server
        },
      },

      rollup: {
        api,
      },

      buildStart() {
        const compiler = (options.compiler =
          options.compiler || resolveCompiler(options.root))

        if (compiler.invalidateTypeCache) {
          options.devServer?.watcher.on('unlink', (file) => {
            compiler.invalidateTypeCache(file)
          })
        }
      },

      resolveId(id) {
        // component export helper
        if (normalizePath(id) === EXPORT_HELPER_ID) {
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
        if (query.raw || query.url) return false

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

        const context = Object.assign({}, this, meta)
        if (!query.vue) {
          // main request
          return transformMain(
            code,
            filename,
            options,
            context,
            ssr,
            customElementFilter(filename)
          )
        } else {
          // sub block request
          const descriptor = query.src
            ? getSrcDescriptor(filename, query) ||
              getTempSrcDescriptor(filename, query)
            : getDescriptor(filename, options)!

          if (query.type === 'template') {
            return transformTemplateAsModule(
              code,
              descriptor,
              options,
              context,
              ssr
            )
          } else if (query.type === 'style') {
            return transformStyle(
              code,
              descriptor,
              Number(query.index || 0),
              options,
              this,
              filename
            )
          }
        }
      },
    }
  }
)
