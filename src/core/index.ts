import fs from 'node:fs'
import process from 'node:process'
import { computed, shallowRef } from '@vue/reactivity'
import {
  createUnplugin,
  type UnpluginContext,
  type UnpluginContextMeta,
  type UnpluginInstance,
} from 'unplugin'
import {
  createFilter,
  normalizePath,
  type ModuleNode,
  type ViteDevServer,
} from 'vite'
import { version } from '../../package.json'
import { resolveCompiler } from '../core/compiler'
import { EXPORT_HELPER_ID, helperCode } from '../core/helper'
import { transformMain } from '../core/main'
import {
  clearScriptCache,
  resolveScript,
  typeDepToSFCMap,
} from '../core/script'
import { transformStyle } from '../core/style'
import { transformTemplateAsModule } from '../core/template'
import { handleHotUpdate, handleTypeDepChange } from './handleHotUpdate'
import {
  getDescriptor,
  getSrcDescriptor,
  getTempSrcDescriptor,
  type ExtendedSFCDescriptor,
} from './utils/descriptorCache'
import { parseVueRequest } from './utils/query'
import type { Server } from '@farmfe/core'
import type {
  SFCBlock,
  SFCScriptCompileOptions,
  SFCStyleCompileOptions,
  SFCTemplateCompileOptions,
} from 'vue/compiler-sfc'
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
    Omit<
      SFCScriptCompileOptions,
      | 'id'
      | 'isProd'
      | 'inlineTemplate'
      | 'templateOptions'
      | 'sourceMap'
      | 'genDefaultAs'
      | 'customElement'
      | 'defineModel'
      | 'propsDestructure'
    >
  > & {
    /**
     * @deprecated defineModel is now a stable feature and always enabled if
     * using Vue 3.4 or above.
     */
    defineModel?: boolean
    /**
     * @deprecated moved to `features.propsDestructure`.
     */
    propsDestructure?: boolean
  }
  template?: Partial<
    Omit<
      SFCTemplateCompileOptions,
      | 'id'
      | 'source'
      | 'ast'
      | 'filename'
      | 'scoped'
      | 'slotted'
      | 'isProd'
      | 'inMap'
      | 'ssr'
      | 'ssrCssVars'
      | 'preprocessLang'
    >
  >
  style?: Partial<
    Omit<
      SFCStyleCompileOptions,
      | 'filename'
      | 'id'
      | 'isProd'
      | 'source'
      | 'scoped'
      | 'cssDevSourcemap'
      | 'postcssOptions'
      | 'map'
    >
  >

  /**
   * @deprecated moved to `features.customElement`.
   */
  customElement?: boolean | string | RegExp | (string | RegExp)[]

  /**
   * Use custom compiler-sfc instance. Can be used to force a specific version.
   */
  compiler?: typeof _compiler

  /**
   * @default true
   */
  inlineTemplate?: boolean

  features?: {
    optionsAPI?: boolean
    prodDevtools?: boolean
    prodHydrationMismatchDetails?: boolean
    /**
     * Enable reactive destructure for `defineProps`.
     * - Available in Vue 3.4 and later.
     * - Defaults to true in Vue 3.5+
     * - Defaults to false in Vue 3.4 (**experimental**)
     */
    propsDestructure?: boolean
    /**
     * Transform Vue SFCs into custom elements.
     * - `true`: all `*.vue` imports are converted into custom elements
     * - `string | RegExp`: matched files are converted into custom elements
     *
     * @default /\.ce\.vue$/
     */
    customElement?: boolean | string | RegExp | (string | RegExp)[]
    /**
     * Customize the component ID generation strategy.
     * - `'filepath'`: hash the file path (relative to the project root)
     * - `'filepath-source'`: hash the file path and the source code
     * - `function`: custom function that takes the file path, source code,
     *   whether in production mode, and the default hash function as arguments
     * - **default:** `'filepath'` in development, `'filepath-source'` in production
     */
    componentIdGenerator?:
      | 'filepath'
      | 'filepath-source'
      | ((
          filepath: string,
          source: string,
          isProduction: boolean | undefined,
          getHash: (text: string) => string,
        ) => string)
  }
}

export type Context = UnpluginContext & UnpluginContextMeta

export type ResolvedOptions = Omit<Options, 'customElement'> &
  Required<
    Pick<
      Options,
      | 'include'
      | 'isProduction'
      | 'ssr'
      | 'sourceMap'
      | 'root'
      | 'compiler'
      | 'inlineTemplate'
      | 'features'
    >
  > & {
    /** Vite only */
    devServer?: ViteDevServer
    devToolsEnabled?: boolean
    cssDevSourcemap: boolean
  }

function resolveOptions(rawOptions: Options): ResolvedOptions {
  const root = rawOptions.root ?? process.cwd()
  const isProduction =
    rawOptions.isProduction ?? process.env.NODE_ENV === 'production'
  const features = {
    ...rawOptions.features,
    optionsAPI: true,
    prodDevtools: false,
    prodHydrationMismatchDetails: false,
    ...rawOptions.features,
    customElement:
      (rawOptions.features?.customElement || rawOptions.customElement) ??
      /\.ce\.vue$/,
  }

  return {
    ...rawOptions,
    include: rawOptions.include ?? /\.vue$/,
    isProduction,
    ssr: rawOptions.ssr ?? false,
    sourceMap: rawOptions.sourceMap ?? true,
    root,
    compiler: rawOptions.compiler as any, // to be set in buildStart
    devToolsEnabled: features.prodDevtools || !isProduction,
    cssDevSourcemap: false,
    inlineTemplate: rawOptions.inlineTemplate ?? true,
    features,
  }
}

export const plugin: UnpluginInstance<Options | undefined, false> =
  createUnplugin((rawOptions = {}, meta) => {
    clearScriptCache()

    const options = shallowRef(resolveOptions(rawOptions))

    const filter = computed(() =>
      createFilter(options.value.include, options.value.exclude),
    )

    const customElementFilter = computed(() => {
      const customElement = options.value.features.customElement
      return typeof customElement === 'boolean'
        ? () => customElement as boolean
        : createFilter(customElement)
    })

    const api = {
      get options() {
        return options.value
      },
      set options(value) {
        options.value = value
      },
      version,
    }

    let transformCachedModule = false

    return {
      name: 'unplugin-vue',

      vite: {
        api,
        handleHotUpdate(ctx) {
          ctx.server.ws.send({
            type: 'custom',
            event: 'file-changed',
            data: { file: normalizePath(ctx.file) },
          })

          if (options.value.compiler.invalidateTypeCache) {
            options.value.compiler.invalidateTypeCache(ctx.file)
          }

          let typeDepModules: ModuleNode[] | undefined
          const matchesFilter = filter.value(ctx.file)
          if (typeDepToSFCMap.has(ctx.file)) {
            typeDepModules = handleTypeDepChange(
              typeDepToSFCMap.get(ctx.file)!,
              ctx,
            )
            if (!matchesFilter) return typeDepModules
          }
          if (matchesFilter) {
            return handleHotUpdate(
              ctx,
              options.value,
              customElementFilter.value(ctx.file),
              typeDepModules,
            )
          }
        },

        config(config) {
          const parseDefine = (v: unknown) => {
            try {
              return typeof v === 'string' ? JSON.parse(v) : v
            } catch {
              return v
            }
          }

          return {
            resolve: {
              dedupe: config.build?.ssr ? [] : ['vue'],
            },
            define: {
              __VUE_OPTIONS_API__:
                options.value.features?.optionsAPI ??
                parseDefine(config.define?.__VUE_OPTIONS_API__) ??
                true,
              __VUE_PROD_DEVTOOLS__:
                (options.value.features?.prodDevtools ||
                  parseDefine(config.define?.__VUE_PROD_DEVTOOLS__)) ??
                false,
              __VUE_PROD_HYDRATION_MISMATCH_DETAILS__:
                (options.value.features?.prodHydrationMismatchDetails ||
                  parseDefine(
                    config.define?.__VUE_PROD_HYDRATION_MISMATCH_DETAILS__,
                  )) ??
                false,
            },
            ssr: {
              // @ts-ignore -- config.legacy.buildSsrCjsExternalHeuristics will be removed in Vite 5
              external: config.legacy?.buildSsrCjsExternalHeuristics
                ? ['vue', '@vue/server-renderer']
                : [],
            },
          }
        },

        configResolved(config) {
          options.value = {
            ...options.value,
            root: config.root,
            sourceMap:
              config.command === 'build' ? !!config.build.sourcemap : true,
            cssDevSourcemap: config.css?.devSourcemap ?? false,
            isProduction: config.isProduction,
            compiler: options.value.compiler || resolveCompiler(config.root),
            devToolsEnabled: !!(
              options.value.features.prodDevtools ||
              config.define!.__VUE_PROD_DEVTOOLS__ ||
              !config.isProduction
            ),
          }

          // #507 suppress warnings for non-recognized pseudo selectors from lightningcss
          const _warn = config.logger.warn
          config.logger.warn = (...args) => {
            const msg = args[0]
            if (
              /\[lightningcss\] '(?:deep|slotted|global)' is not recognized as a valid pseudo-/.test(
                msg,
              )
            ) {
              return
            }
            _warn(...args)
          }

          transformCachedModule =
            config.command === 'build' &&
            options.value.sourceMap &&
            config.build.watch != null
        },

        shouldTransformCachedModule({ id }) {
          if (transformCachedModule && parseVueRequest(id).query.vue) {
            return true
          }
          return false
        },

        configureServer(server) {
          options.value.devServer = server
        },
      },

      rollup: {
        api,
      },

      rolldown: {
        api,
        options(opt) {
          opt.moduleTypes ||= {}
          opt.moduleTypes.vue ||= 'js'
        },
      },

      farm: {
        config(config) {
          return {
            compilation: {
              resolve: {
                dedupe:
                  config.compilation?.output?.targetEnv === 'node'
                    ? []
                    : ['vue'],
              },
              define: {
                __VUE_OPTIONS_API__: !!(
                  (options.value.features?.optionsAPI ?? true) ||
                  config?.compilation?.define?.__VUE_OPTIONS_API__
                ),
                __VUE_PROD_DEVTOOLS__: !!(
                  options.value.features?.prodDevtools ||
                  config?.compilation?.define?.__VUE_PROD_DEVTOOLS__
                ),
                __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: !!(
                  options.value.features?.prodHydrationMismatchDetails ||
                  config?.compilation?.define
                    ?.__VUE_PROD_HYDRATION_MISMATCH_DETAILS__
                ),
              },
            },
          }
        },

        configResolved(config) {
          options.value = {
            ...options.value,
            root: config.root as string,
            sourceMap: config.compilation?.sourcemap as boolean,
            cssDevSourcemap: config.compilation?.sourcemap as boolean,
            isProduction: config.compilation?.mode === 'production',
            compiler:
              options.value.compiler || resolveCompiler(config.root as string),
            devToolsEnabled: !!(
              options.value.features.prodDevtools ||
              config.compilation?.define?.__VUE_PROD_DEVTOOLS__ ||
              config.compilation?.mode !== 'production'
            ),
          }
        },

        configureServer(server: Server) {
          const {
            config: {
              compilation: {
                // @ts-ignore
                output: { publicPath },
              },
            },
          } = server
          // @ts-ignore
          options.value.devServer = Object.assign(server, {
            config: { ...server.config, base: publicPath },
          })
        },

        updateModules: {
          executor(ctx) {
            options.value.devServer?.ws.send({
              type: 'custom',
              event: 'file-changed',
              data: { file: normalizePath(ctx.file) },
            })
            if (options.value.compiler.invalidateTypeCache) {
              options.value.compiler.invalidateTypeCache(ctx.file)
            }
            if (typeDepToSFCMap.has(ctx.file)) {
              handleTypeDepChange(typeDepToSFCMap.get(ctx.file)!, ctx as any)
            }
            if (filter.value(ctx.file)) {
              handleHotUpdate(
                ctx as any,
                options.value,
                customElementFilter.value(ctx.file),
              )
            }
          },
        },
      },

      buildStart() {
        const compiler = (options.value.compiler =
          options.value.compiler || resolveCompiler(options.value.root))

        if (compiler.invalidateTypeCache) {
          options.value.devServer?.watcher.on('unlink', (file) => {
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
        if (id === EXPORT_HELPER_ID) {
          return helperCode
        }

        const { filename, query } = parseVueRequest(id)
        // select corresponding block for sub-part virtual modules
        if (query.vue) {
          if (query.src) {
            return fs.readFileSync(filename, 'utf8')
          }
          const descriptor = getDescriptor(filename, options.value)!
          let block: SFCBlock | null | undefined
          switch (query.type) {
            case 'script': {
              // handle <script> + <script setup> merge via compileScript()
              block = resolveScript(
                meta.framework,
                descriptor,
                options.value,
                customElementFilter.value(filename),
              )

              break
            }
            case 'template': {
              block = descriptor.template!

              break
            }
            case 'style': {
              block = descriptor.styles[query.index!]

              break
            }
            default:
              if (query.index != null) {
                block = descriptor.customBlocks[query.index]
              }
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
        if (!filter.value(filename) && !query.vue) return false

        return true
      },

      transform(code, id) {
        const { filename, query } = parseVueRequest(id)
        const context = Object.assign({}, this, meta)

        if (query.vue) {
          // sub block request
          const descriptor: ExtendedSFCDescriptor = query.src
            ? getSrcDescriptor(filename, query) ||
              getTempSrcDescriptor(filename, query)
            : getDescriptor(filename, options.value)!

          if (query.src) {
            this.addWatchFile(filename)
          }

          if (query.type === 'template') {
            return transformTemplateAsModule(
              code,
              filename,
              descriptor,
              options.value,
              context,
              customElementFilter.value(filename),
            )
          } else if (query.type === 'style') {
            return transformStyle(
              code,
              descriptor,
              Number(query.index || 0),
              options.value,
              this,
              filename,
            )
          }
        } else {
          // main request
          return transformMain(
            code,
            filename,
            options.value,
            context,
            customElementFilter.value(filename),
          )
        }
      },
    }
  })
