import type { UnpluginMessage } from 'unplugin'
import type { CompilerError } from 'vue/compiler-sfc'

export function createError(
  id: string,
  error: CompilerError | SyntaxError | string,
): UnpluginMessage | string {
  if (typeof error === 'string') {
    return error
  }

  const { message, name, stack } = error
  const unpluginMessage: UnpluginMessage = {
    id,
    plugin: 'vue',
    message,
    name,
    stack,
  }
  if ('code' in error && error.loc) {
    unpluginMessage.loc = {
      file: id,
      line: error.loc.start.line,
      column: error.loc.start.column,
    }
  }
  return unpluginMessage
}
