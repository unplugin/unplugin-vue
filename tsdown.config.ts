import { nodeLib } from 'tsdown-preset-sxzz'

export default nodeLib(
  { entry: 'shallow' },
  {
    deps: {
      // type-only
      neverBundle: ['rollup', '@farmfe/core'],
    },
  },
)
