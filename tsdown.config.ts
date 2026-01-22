import { nodeLib } from 'tsdown-preset-sxzz'

export default nodeLib(
  {
    entry: 'shallow',
    inlineDeps: ['slash'],
  },
  {
    // type-only
    external: ['rollup', '@farmfe/core'],
  },
)
