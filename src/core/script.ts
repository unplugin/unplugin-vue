import { resolveTemplateCompilerOptions } from './template'
import { cache as descriptorCache } from './utils/descriptorCache'
import type { ResolvedOptions } from '.'
import type { UnpluginContextMeta } from 'unplugin'
import type { SFCDescriptor, SFCScriptBlock } from 'vue/compiler-sfc'

// ssr and non ssr builds would output different script content
let clientCache = new WeakMap<SFCDescriptor, SFCScriptBlock | null>()
let ssrCache = new WeakMap<SFCDescriptor, SFCScriptBlock | null>()

export const typeDepToSFCMap: Map<string, Set<string>> = new Map()

export function invalidateScript(filename: string): void {
  const desc = descriptorCache.get(filename)
  if (desc) {
    clientCache.delete(desc)
    ssrCache.delete(desc)
  }
}

export function getResolvedScript(
  descriptor: SFCDescriptor,
  ssr: boolean,
): SFCScriptBlock | null | undefined {
  return (ssr ? ssrCache : clientCache).get(descriptor)
}

export function setResolvedScript(
  descriptor: SFCDescriptor,
  script: SFCScriptBlock,
  ssr: boolean,
): void {
  ;(ssr ? ssrCache : clientCache).set(descriptor, script)
}

export function clearScriptCache(): void {
  clientCache = new WeakMap()
  ssrCache = new WeakMap()
}

// Check if we can use compile template as inlined render function
// inside <script setup>. This can only be done for build because
// inlined template cannot be individually hot updated.
export function isUseInlineTemplate(
  descriptor: SFCDescriptor,
  options: ResolvedOptions,
): boolean {
  return (
    options.inlineTemplate &&
    !options.devServer &&
    !options.devToolsEnabled &&
    !!descriptor.scriptSetup &&
    !descriptor.template?.src
  )
}

export const scriptIdentifier = `_sfc_main`

export function resolveScript(
  framework: UnpluginContextMeta['framework'],
  descriptor: SFCDescriptor,
  options: ResolvedOptions,
  customElement: boolean,
): SFCScriptBlock | null {
  if (!descriptor.script && !descriptor.scriptSetup) {
    return null
  }

  const { ssr } = options
  const cached = getResolvedScript(descriptor, ssr)
  if (cached) {
    return cached
  }

  const resolved: SFCScriptBlock = options.compiler.compileScript(descriptor, {
    ...options.script,
    id: descriptor.id,
    isProd: options.isProduction,
    inlineTemplate: isUseInlineTemplate(descriptor, options),
    templateOptions: resolveTemplateCompilerOptions(
      descriptor,
      options,
      descriptor.filename,
    ),
    sourceMap: options.sourceMap,
    genDefaultAs: canInlineMain(framework, descriptor, options)
      ? scriptIdentifier
      : undefined,
    customElement,
    propsDestructure:
      options.features.propsDestructure ?? options.script?.propsDestructure,
  })

  if (!options.isProduction && resolved?.deps) {
    for (const [key, sfcs] of typeDepToSFCMap) {
      if (sfcs.has(descriptor.filename) && !resolved.deps.includes(key)) {
        sfcs.delete(descriptor.filename)
      }
    }

    for (const dep of resolved.deps) {
      const existingSet = typeDepToSFCMap.get(dep)
      if (existingSet) {
        existingSet.add(descriptor.filename)
      } else {
        typeDepToSFCMap.set(dep, new Set([descriptor.filename]))
      }
    }
  }

  setResolvedScript(descriptor, resolved, ssr)
  return resolved
}

// If the script is js/ts and has no external src, it can be directly placed
// in the main module. Skip for build
export function canInlineMain(
  framework: UnpluginContextMeta['framework'],
  descriptor: SFCDescriptor,
  options: ResolvedOptions,
): boolean {
  if (descriptor.script?.src || descriptor.scriptSetup?.src) {
    return false
  }
  const lang = descriptor.script?.lang || descriptor.scriptSetup?.lang
  if (!lang || lang === 'js') {
    return true
  }
  if (
    lang === 'ts' &&
    (options.devServer || ['esbuild', 'rspack'].includes(framework))
  ) {
    return true
  }
  return false
}
