import path from 'node:path'
import slash from 'slash'
import { getResolvedScript, resolveScript } from './script'
import { createError } from './utils/error'
import type { Context, ResolvedOptions } from '.'
import type {
  CompilerOptions,
  SFCDescriptor,
  SFCTemplateCompileOptions,
  SFCTemplateCompileResults,
} from 'vue/compiler-sfc'

// eslint-disable-next-line require-await
export async function transformTemplateAsModule(
  code: string,
  filename: string,
  descriptor: SFCDescriptor,
  options: ResolvedOptions,
  pluginContext: Context,
  customElement: boolean,
): Promise<{
  code: string
  map: any
}> {
  const result = compile(
    code,
    filename,
    descriptor,
    options,
    pluginContext,
    customElement,
  )

  let returnCode = result.code
  if (
    options.devServer &&
    options.devServer.config.server.hmr !== false &&
    !options.ssr &&
    !options.isProduction
  ) {
    returnCode += `\nimport.meta.hot.accept(({ render }) => {
      __VUE_HMR_RUNTIME__.rerender(${JSON.stringify(descriptor.id)}, render)
    })`
  }

  return {
    code: returnCode,
    map: result.map,
  }
}

/**
 * transform the template directly in the main SFC module
 */
export function transformTemplateInMain(
  code: string,
  descriptor: SFCDescriptor,
  options: ResolvedOptions,
  pluginContext: Context,
  customElement: boolean,
): SFCTemplateCompileResults {
  const result = compile(
    code,
    descriptor.filename,
    descriptor,
    options,
    pluginContext,
    customElement,
  )
  return {
    ...result,
    code: result.code.replace(
      /\nexport (function|const) (render|ssrRender)/,
      '\n$1 _sfc_$2',
    ),
  }
}

export function compile(
  code: string,
  filename: string,
  descriptor: SFCDescriptor,
  options: ResolvedOptions,
  pluginContext: Context,
  customElement: boolean,
): SFCTemplateCompileResults {
  resolveScript(pluginContext.framework, descriptor, options, customElement)
  const result = options.compiler.compileTemplate({
    ...resolveTemplateCompilerOptions(descriptor, options, filename)!,
    source: code,
  })

  if (result.errors.length > 0) {
    result.errors.forEach((error) =>
      pluginContext.error(createError(filename, error)),
    )
  }

  if (result.tips.length > 0) {
    result.tips.forEach((tip) =>
      pluginContext.warn({
        id: filename,
        message: tip,
      }),
    )
  }

  return result
}

export function resolveTemplateCompilerOptions(
  descriptor: SFCDescriptor,
  options: ResolvedOptions,
  filename: string,
): Omit<SFCTemplateCompileOptions, 'source'> | undefined {
  const block = descriptor.template
  if (!block) {
    return
  }
  const resolvedScript = getResolvedScript(descriptor, options.ssr)
  const hasScoped = descriptor.styles.some((s) => s.scoped)
  const { id, cssVars } = descriptor

  let transformAssetUrls = options.template?.transformAssetUrls
  // compiler-sfc should export `AssetURLOptions`
  let assetUrlOptions //: AssetURLOptions | undefined
  if (transformAssetUrls === false) {
    // if explicitly disabled, let assetUrlOptions be undefined
  } else if (options.devServer) {
    // during dev, inject vite base so that compiler-sfc can transform
    // relative paths directly to absolute paths without incurring an extra import
    // request
    if (filename.startsWith(options.root)) {
      const devBase = options.devServer.config.base
      assetUrlOptions = {
        base:
          (options.devServer.config.server?.origin ?? '') +
          devBase +
          slash(path.relative(options.root, path.dirname(filename))),
        includeAbsolute: !!devBase,
      }
    }
  } else {
    // build: force all asset urls into import requests so that they go through
    // the assets plugin for asset registration
    assetUrlOptions = {
      includeAbsolute: true,
    }
  }

  if (transformAssetUrls && typeof transformAssetUrls === 'object') {
    // presence of array fields means this is raw tags config
    if (Object.values(transformAssetUrls).some((val) => Array.isArray(val))) {
      transformAssetUrls = {
        ...assetUrlOptions,
        tags: transformAssetUrls as any,
      }
    } else {
      transformAssetUrls = { ...assetUrlOptions, ...transformAssetUrls }
    }
  } else {
    transformAssetUrls = assetUrlOptions
  }

  let preprocessOptions = block.lang && options.template?.preprocessOptions
  if (block.lang === 'pug') {
    preprocessOptions = {
      doctype: 'html',
      ...preprocessOptions,
    }
  }

  // if using TS, support TS syntax in template expressions
  const expressionPlugins: CompilerOptions['expressionPlugins'] =
    options.template?.compilerOptions?.expressionPlugins || []
  const lang = descriptor.scriptSetup?.lang || descriptor.script?.lang
  if (lang && /tsx?$/.test(lang) && !expressionPlugins.includes('typescript')) {
    expressionPlugins.push('typescript')
  }

  return {
    ...options.template,
    id,
    vapor: descriptor.vapor,
    ast: canReuseAST(options.compiler.version)
      ? descriptor.template?.ast
      : undefined,
    filename,
    scoped: hasScoped,
    slotted: descriptor.slotted,
    isProd: options.isProduction,
    inMap: block.src ? undefined : block.map,
    ssr: options.ssr,
    ssrCssVars: cssVars,
    transformAssetUrls,
    preprocessLang: block.lang === 'html' ? undefined : block.lang,
    preprocessOptions,
    compilerOptions: {
      ...options.template?.compilerOptions,
      scopeId: hasScoped ? `data-v-${id}` : undefined,
      bindingMetadata: resolvedScript ? resolvedScript.bindings : undefined,
      expressionPlugins,
      sourceMap: options.sourceMap,
    },
  }
}

/**
 * Versions before 3.4.3 have issues when the user has passed additional
 * template parse options e.g. `isCustomElement`.
 */
function canReuseAST(version: string | undefined) {
  if (version) {
    const [, minor, patch] = version.split('.').map(Number)
    if (minor >= 4 && patch >= 3) {
      return true
    }
  }
  return false
}
