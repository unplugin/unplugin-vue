import type { CompilerError } from 'vue/compiler-sfc'

export function createError(id: string, error: CompilerError | SyntaxError) {
  const { message, name, stack } = error
  const _error: Record<string, any> = {
    id,
    plugin: 'vue',
    message,
    name,
    stack,
  }

  if ('code' in error && error.loc) {
    _error.loc = {
      file: id,
      line: error.loc.start.line,
      column: error.loc.start.column,
    }
  }

  return _error
}
