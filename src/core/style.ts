import { formatPostcssSourceMap } from 'vite'
import type { SFCDescriptor } from 'vue/compiler-sfc'
import type { ExistingRawSourceMap } from 'rollup'
import type { UnpluginContext } from 'unplugin'
import type { RawSourceMap } from 'source-map-js'
import type { ResolvedOptions } from '.'

export async function transformStyle(
  code: string,
  descriptor: SFCDescriptor,
  index: number,
  options: ResolvedOptions,
  context: UnpluginContext,
  filename: string,
) {
  const block = descriptor.styles[index]
  // vite already handles pre-processors and CSS module so this is only
  // applying SFC-specific transforms like scoped mode and CSS vars rewrite (v-bind(var))
  const result = await options.compiler.compileStyleAsync({
    ...options.style,
    filename: descriptor.filename,
    id: `data-v-${descriptor.id}`,
    isProd: options.isProduction,
    source: code,
    scoped: block.scoped,
    ...(options.cssDevSourcemap
      ? {
          postcssOptions: {
            map: {
              from: filename,
              inline: false,
              annotation: false,
            },
          },
        }
      : {}),
  })

  if (result.errors.length > 0) {
    result.errors.forEach((error: any) => {
      if (error.line && error.column) {
        error.loc = {
          file: descriptor.filename,
          line: error.line + block.loc.start.line,
          column: error.column,
        }
      }
      context.error(error)
    })
    return null
  }

  const map = result.map
    ? await formatPostcssSourceMap(
        // version property of result.map is declared as string
        // but actually it is a number
        result.map as Omit<RawSourceMap, 'version'> as ExistingRawSourceMap,
        filename,
      )
    : (null as any)

  return {
    code: result.code,
    map,
  }
}
