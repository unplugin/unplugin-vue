import fs from 'node:fs'
import path from 'node:path'
import {
  addMapping,
  fromMap,
  toEncodedMap,
  type EncodedSourceMap as GenEncodedSourceMap,
} from '@jridgewell/gen-mapping'
import {
  eachMapping,
  TraceMap,
  type EncodedSourceMap as TraceEncodedSourceMap,
} from '@jridgewell/trace-mapping'
import { normalizePath, transformWithEsbuild } from 'vite'
import { isEqualBlock, isOnlyTemplateChanged } from './handleHotUpdate'
import { EXPORT_HELPER_ID } from './helper'
import {
  canInlineMain,
  isUseInlineTemplate,
  resolveScript,
  scriptIdentifier,
} from './script'
import { transformTemplateInMain } from './template'
import {
  createDescriptor,
  getDescriptor,
  getPrevDescriptor,
  setSrcDescriptor,
} from './utils/descriptorCache'
import { createError } from './utils/error'
import type { Context, ResolvedOptions } from '.'
import type { PluginContext } from 'rollup'
import type { RawSourceMap } from 'source-map-js'
import type { SFCBlock, SFCDescriptor } from 'vue/compiler-sfc'

export async function transformMain(
  code: string,
  filename: string,
  options: ResolvedOptions,
  pluginContext: Context,
  customElement: boolean,
): Promise<{ code: string; map: any; meta: any } | null> {
  const { devServer, isProduction, devToolsEnabled, ssr } = options

  const prevDescriptor = getPrevDescriptor(filename)
  const { descriptor, errors } = createDescriptor(filename, code, options)

  if (fs.existsSync(filename)) {
    // populate descriptor cache for HMR if it's not set yet
    getDescriptor(
      filename,
      options,
      true,
      true,
      // for vue files, create descriptor from fs read to be consistent with
      // logic in handleHotUpdate()
      // for non vue files, e.g. md files in vitepress, we assume
      // `hmrContext.read` is overwritten so handleHotUpdate() is dealing with
      // post-transform code, so we populate the descriptor with post-transform
      // code here as well.
      filename.endsWith('.vue') ? undefined : code,
    )
  }

  if (errors.length > 0) {
    errors.forEach((error) => pluginContext.error(createError(filename, error)))
    return null
  }

  // feature information
  const attachedProps: [string, string][] = []
  const hasScoped = descriptor.styles.some((s) => s.scoped)

  // script
  const { code: scriptCode, map: scriptMap } = await genScriptCode(
    descriptor,
    options,
    pluginContext,
    customElement,
  )

  // template
  const hasTemplateImport =
    descriptor.template && !isUseInlineTemplate(descriptor, options)

  let templateCode = ''
  let templateMap: RawSourceMap | undefined
  if (hasTemplateImport) {
    ;({ code: templateCode, map: templateMap } = await genTemplateCode(
      descriptor,
      options,
      pluginContext,
      customElement,
    ))
  }

  if (hasTemplateImport) {
    attachedProps.push(
      ssr ? ['ssrRender', '_sfc_ssrRender'] : ['render', '_sfc_render'],
    )
  } else if (
    prevDescriptor &&
    !isEqualBlock(descriptor.template, prevDescriptor.template)
  ) {
    // #2128
    // User may empty the template but we didn't provide rerender function before
    attachedProps.push([ssr ? 'ssrRender' : 'render', '() => {}'])
  }

  // styles
  const stylesCode = await genStyleCode(
    descriptor,
    pluginContext,
    customElement,
    attachedProps,
  )

  // custom blocks
  const customBlocksCode = await genCustomBlockCode(descriptor, pluginContext)

  const output: string[] = [
    scriptCode,
    templateCode,
    stylesCode,
    customBlocksCode,
  ]
  if (hasScoped) {
    attachedProps.push([`__scopeId`, JSON.stringify(`data-v-${descriptor.id}`)])
  }
  if (devToolsEnabled || (devServer && !isProduction)) {
    // expose filename during serve for devtools to pickup
    attachedProps.push([
      `__file`,
      JSON.stringify(isProduction ? path.basename(filename) : filename),
    ])
  }

  // HMR
  if (
    devServer &&
    devServer.config.server.hmr !== false &&
    !ssr &&
    !isProduction
  ) {
    output.push(
      `_sfc_main.__hmrId = ${JSON.stringify(descriptor.id)}`,
      `typeof __VUE_HMR_RUNTIME__ !== 'undefined' && ` +
        `__VUE_HMR_RUNTIME__.createRecord(_sfc_main.__hmrId, _sfc_main)`,
      `import.meta.hot.on('file-changed', ({ file }) => {`,
      `  __VUE_HMR_RUNTIME__.CHANGED_FILE = file`,
      `})`,
    )
    // check if the template is the only thing that changed
    if (prevDescriptor && isOnlyTemplateChanged(prevDescriptor, descriptor)) {
      // #7 only consider re-render if the HMR is triggered by the current component,
      // otherwise reload. Due to vite will cache the transform result. If the HMR
      // is triggered by other files that the current component relies on, a reload
      // is required.
      output.push(
        `export const _rerender_only = __VUE_HMR_RUNTIME__.CHANGED_FILE === ${JSON.stringify(normalizePath(filename))}`,
      )
    }
    output.push(
      `import.meta.hot.accept(mod => {`,
      `  if (!mod) return`,
      `  const { default: updated, _rerender_only } = mod`,
      `  if (_rerender_only) {`,
      `    __VUE_HMR_RUNTIME__.rerender(updated.__hmrId, updated.render)`,
      `  } else {`,
      `    __VUE_HMR_RUNTIME__.reload(updated.__hmrId, updated)`,
      `  }`,
      `})`,
    )
  }

  // SSR module registration by wrapping user setup
  if (ssr) {
    const normalizedFilename = normalizePath(
      path.relative(options.root, filename),
    )
    output.push(
      `import { useSSRContext as __vite_useSSRContext } from 'vue'`,
      `const _sfc_setup = _sfc_main.setup`,
      `_sfc_main.setup = (props, ctx) => {`,
      `  const ssrContext = __vite_useSSRContext()`,
      `  ;(ssrContext.modules || (ssrContext.modules = new Set())).add(${JSON.stringify(
        normalizedFilename,
      )})`,
      `  return _sfc_setup ? _sfc_setup(props, ctx) : undefined`,
      `}`,
    )
  }

  let resolvedMap: RawSourceMap | undefined = undefined
  if (options.sourceMap) {
    // the mappings of the source map for the inlined template should be moved
    // because the position does not include the script tag part.
    // we also concatenate the two source maps while doing that.
    if (templateMap) {
      const from = scriptMap ?? {
        file: filename,
        sourceRoot: '',
        version: 3,
        sources: [],
        sourcesContent: [],
        names: [],
        mappings: '',
      }
      const gen = fromMap(
        // version property of result.map is declared as string
        // but actually it is `3`
        from as Omit<RawSourceMap, 'version'> as TraceEncodedSourceMap,
      )
      const tracer = new TraceMap(
        // same above
        templateMap as Omit<RawSourceMap, 'version'> as TraceEncodedSourceMap,
      )
      const offset = (scriptCode.match(/\r?\n/g)?.length ?? 0) + 1
      eachMapping(tracer, (m) => {
        if (m.source == null) return
        addMapping(gen, {
          source: m.source,
          original: { line: m.originalLine, column: m.originalColumn },
          generated: {
            line: m.generatedLine + offset,
            column: m.generatedColumn,
          },
        })
      })

      // same above
      resolvedMap = toEncodedMap(gen) as Omit<
        GenEncodedSourceMap,
        'version'
      > as RawSourceMap
      // if this is a template only update, we will be reusing a cached version
      // of the main module compile result, which has outdated sourcesContent.
      resolvedMap.sourcesContent = templateMap.sourcesContent
    } else {
      resolvedMap = scriptMap
    }
  }

  if (attachedProps.length === 0) {
    output.push(`export default _sfc_main`)
  } else {
    output.push(
      `import _export_sfc from '${EXPORT_HELPER_ID}'`,
      `export default /*#__PURE__*/_export_sfc(_sfc_main, [${attachedProps
        .map(([key, val]) => `['${key}',${val}]`)
        .join(',')}])`,
    )
  }

  // handle TS transpilation
  let resolvedCode = output.join('\n')
  const lang = descriptor.scriptSetup?.lang || descriptor.script?.lang

  if (
    lang &&
    /tsx?$/.test(lang) &&
    !descriptor.script?.src // only normal script can have src
  ) {
    const { code, map } = await transformWithEsbuild(
      resolvedCode,
      filename,
      {
        target: pluginContext.framework === 'vite' ? 'esnext' : undefined,
        charset: 'utf8',
        // #430 support decorators in .vue file
        // target can be overridden by esbuild config target
        ...options.devServer?.config.esbuild,
        loader: 'ts',
        sourcemap: options.sourceMap,
      },
      resolvedMap,
    )
    resolvedCode = code
    resolvedMap = resolvedMap ? (map as any) : resolvedMap
  }

  return {
    code: resolvedCode,
    map: (resolvedMap || {
      mappings: '',
    }) as any,
    meta: {
      vite: {
        lang: descriptor.script?.lang || descriptor.scriptSetup?.lang || 'js',
      },
    },
  }
}

async function genTemplateCode(
  descriptor: SFCDescriptor,
  options: ResolvedOptions,
  pluginContext: Context,
  customElement: boolean,
) {
  const template = descriptor.template!
  const hasScoped = descriptor.styles.some((style) => style.scoped)

  // If the template is not using pre-processor AND is not using external src,
  // compile and inline it directly in the main module. When served in vite this
  // saves an extra request per SFC which can improve load performance.
  if ((!template.lang || template.lang === 'html') && !template.src) {
    return transformTemplateInMain(
      template.content,
      descriptor,
      options,
      pluginContext,
      customElement,
    )
  } else {
    if (template.src) {
      await linkSrcToDescriptor(
        template.src,
        descriptor,
        pluginContext,
        hasScoped,
      )
    }
    const src = template.src || descriptor.filename
    const srcQuery = template.src
      ? hasScoped
        ? `&src=${descriptor.id}`
        : '&src=true'
      : ''
    const scopedQuery = hasScoped ? `&scoped=${descriptor.id}` : ``
    const attrsQuery = attrsToQuery(template.attrs, 'js', true)
    const query = `?vue&type=template${srcQuery}${scopedQuery}${attrsQuery}`
    const request = JSON.stringify(src + query)
    const renderFnName = options.ssr ? 'ssrRender' : 'render'
    return {
      code: `import { ${renderFnName} as _sfc_${renderFnName} } from ${request}`,
      map: undefined,
    }
  }
}

async function genScriptCode(
  descriptor: SFCDescriptor,
  options: ResolvedOptions,
  pluginContext: Context,
  customElement: boolean,
): Promise<{
  code: string
  map: RawSourceMap | undefined
}> {
  // @ts-expect-error TODO remove when 3.6 is out
  const vaporFlag = descriptor.vapor ? '__vapor: true' : ''
  let scriptCode = `const ${scriptIdentifier} = { ${vaporFlag} }`
  let map: RawSourceMap | undefined

  const script = resolveScript(
    pluginContext.framework,
    descriptor,
    options,
    customElement,
  )
  if (script) {
    // If the script is js/ts and has no external src, it can be directly placed
    // in the main module.
    if (canInlineMain(pluginContext.framework, descriptor, options)) {
      if (!options.compiler.version) {
        // if compiler-sfc exposes no version, it's < 3.3 and doesn't support
        // genDefaultAs option.
        const userPlugins = options.script?.babelParserPlugins || []
        const defaultPlugins =
          script.lang === 'ts'
            ? userPlugins.includes('decorators')
              ? (['typescript'] as const)
              : (['typescript', 'decorators-legacy'] as const)
            : []
        scriptCode = options.compiler.rewriteDefault(
          script.content,
          scriptIdentifier,
          [...defaultPlugins, ...userPlugins],
        )
      } else {
        scriptCode = script.content
      }
      map = script.map
    } else {
      if (script.src) {
        await linkSrcToDescriptor(script.src, descriptor, pluginContext, false)
      }
      const src = script.src || descriptor.filename
      const langFallback = (script.src && path.extname(src).slice(1)) || 'js'
      const attrsQuery = attrsToQuery(script.attrs, langFallback)
      const srcQuery = script.src ? `&src=true` : ``
      const query = `?vue&type=script${srcQuery}${attrsQuery}`
      const request = JSON.stringify(src + query)
      scriptCode =
        `import _sfc_main from ${request}\n` + `export * from ${request}` // support named exports
    }
  }
  return {
    code: scriptCode,
    map,
  }
}

async function genStyleCode(
  descriptor: SFCDescriptor,
  pluginContext: Context,
  customElement: boolean,
  attachedProps: [string, string][],
) {
  let stylesCode = ``
  let cssModulesMap: Record<string, string> | undefined
  if (descriptor.styles.length > 0) {
    for (let i = 0; i < descriptor.styles.length; i++) {
      const style = descriptor.styles[i]
      if (style.src) {
        await linkSrcToDescriptor(
          style.src,
          descriptor,
          pluginContext,
          style.scoped,
        )
      }
      const src = style.src || descriptor.filename
      // do not include module in default query, since we use it to indicate
      // that the module needs to export the modules json
      const attrsQuery = attrsToQuery(style.attrs, 'css')
      const srcQuery = style.src
        ? style.scoped
          ? `&src=${descriptor.id}`
          : '&src=true'
        : ''
      const directQuery = customElement ? `&inline` : ``
      const scopedQuery = style.scoped ? `&scoped=${descriptor.id}` : ``
      const query = `?vue&type=style&index=${i}${srcQuery}${directQuery}${scopedQuery}`
      const styleRequest = src + query + attrsQuery
      if (style.module) {
        if (customElement) {
          throw new Error(
            `<style module> is not supported in custom elements mode.`,
          )
        }
        const [importCode, nameMap] = genCSSModulesCode(
          i,
          styleRequest,
          style.module,
        )
        stylesCode += importCode
        Object.assign((cssModulesMap ||= {}), nameMap)
      } else if (customElement) {
        stylesCode += `\nimport _style_${i} from ${JSON.stringify(
          styleRequest,
        )}`
      } else {
        stylesCode += `\nimport ${JSON.stringify(styleRequest)}`
      }
      // TODO SSR critical CSS collection
    }
    if (customElement) {
      attachedProps.push([
        `styles`,
        `[${descriptor.styles.map((_, i) => `_style_${i}`).join(',')}]`,
      ])
    }
  }
  if (cssModulesMap) {
    const mappingCode = `${Object.entries(cssModulesMap).reduce(
      (code, [key, value]) => `${code}"${key}":${value},\n`,
      '{\n',
    )}}`
    stylesCode += `\nconst cssModules = ${mappingCode}`
    attachedProps.push([`__cssModules`, `cssModules`])
  }
  return stylesCode
}

function genCSSModulesCode(
  index: number,
  request: string,
  moduleName: string | boolean,
): [importCode: string, nameMap: Record<string, string>] {
  const styleVar = `style${index}`
  const exposedName = typeof moduleName === 'string' ? moduleName : '$style'
  // inject `.module` before extension so vite handles it as css module
  const moduleRequest = request.replace(/\.(\w+)$/, '.module.$1')
  return [
    `\nimport ${styleVar} from ${JSON.stringify(moduleRequest)}`,
    { [exposedName]: styleVar },
  ]
}

async function genCustomBlockCode(
  descriptor: SFCDescriptor,
  pluginContext: Context,
) {
  let code = ''
  for (let index = 0; index < descriptor.customBlocks.length; index++) {
    const block = descriptor.customBlocks[index]
    if (block.src) {
      await linkSrcToDescriptor(block.src, descriptor, pluginContext, false)
    }
    const src = block.src || descriptor.filename
    const attrsQuery = attrsToQuery(block.attrs, block.type)
    const srcQuery = block.src ? `&src=true` : ``
    const query = `?vue&type=${block.type}&index=${index}${srcQuery}${attrsQuery}`
    const request = JSON.stringify(src + query)
    code += `import block${index} from ${request}\n`
    code += `if (typeof block${index} === 'function') block${index}(_sfc_main)\n`
  }
  return code
}

/**
 * For blocks with src imports, it is important to link the imported file
 * with its owner SFC descriptor so that we can get the information about
 * the owner SFC when compiling that file in the transform phase.
 */
async function linkSrcToDescriptor(
  src: string,
  descriptor: SFCDescriptor,
  pluginContext: Context,
  scoped?: boolean,
) {
  // support rollup only

  if (
    pluginContext.framework === 'rollup' ||
    pluginContext.framework === 'vite'
  ) {
    const srcFile =
      (
        await (pluginContext as unknown as PluginContext).resolve(
          src,
          descriptor.filename,
        )
      )?.id || src
    // #1812 if the src points to a dep file, the resolved id may contain a
    // version query.
    setSrcDescriptor(srcFile.replace(/\?.*$/, ''), descriptor, scoped)
  } else {
    // TODO: unplugin implements context.resolve()
    pluginContext.error(new Error('src attribute is supported on Rollup only.'))
  }
}

// these are built-in query parameters so should be ignored
// if the user happen to add them as attrs
const ignoreList = [
  'id',
  'index',
  'src',
  'type',
  'lang',
  'module',
  'scoped',
  'generic',
]

function attrsToQuery(
  attrs: SFCBlock['attrs'],
  langFallback?: string,
  forceLangFallback = false,
): string {
  let query = ``
  for (const name of Object.keys(attrs)) {
    const value = attrs[name]
    if (!ignoreList.includes(name)) {
      query += `&${encodeURIComponent(name)}${
        value ? `=${encodeURIComponent(value)}` : ``
      }`
    }
  }
  if (langFallback || attrs.lang) {
    query +=
      `lang` in attrs
        ? forceLangFallback
          ? `&lang.${langFallback}`
          : `&lang.${attrs.lang}`
        : `&lang.${langFallback}`
  }
  return query
}
