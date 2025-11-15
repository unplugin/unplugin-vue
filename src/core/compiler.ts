/* eslint-disable @typescript-eslint/no-require-imports */

import type * as _compiler from 'vue/compiler-sfc'

// extend the descriptor so we can store the scopeId on it
declare module 'vue/compiler-sfc' {
  interface SFCDescriptor {
    id: string
  }
}

export function resolveCompiler(root: string): typeof _compiler {
  // resolve from project root first, then fallback to peer dep (if any)
  const compiler = tryResolveCompiler(root) || tryResolveCompiler()
  if (!compiler) {
    throw new Error(
      `Failed to resolve vue/compiler-sfc.\n` +
        `unplugin-vue requires vue (>=3.2.25) ` +
        `to be present in the dependency tree.`,
    )
  }

  return compiler
}

function tryResolveCompiler(root?: string) {
  const vueMeta = tryRequire('vue/package.json', root)
  // make sure to check the version is 3+ since 2.7 now also has vue/compiler-sfc
  if (vueMeta && vueMeta.version.split('.')[0] >= 3) {
    return tryRequire('vue/compiler-sfc', root)
  }
}

function tryRequire(id: string, from?: string) {
  try {
    return from ? require(require.resolve(id, { paths: [from] })) : require(id)
  } catch {}
}
