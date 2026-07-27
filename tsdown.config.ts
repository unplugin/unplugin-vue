import { nodeLib } from 'tsdown-preset-sxzz'

export default nodeLib(
  { entry: 'shallow' },
  {
    treeshake: {
      moduleSideEffects: false,
    },
    deps: {
      dts: {
        // type-only
        neverBundle: ['rollup', '@farmfe/core'],
      },
    },
  },
)
