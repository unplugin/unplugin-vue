import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['./src/index.ts'],
  format: ['esm', 'cjs'],
  target: 'node12',
  clean: true,
  dts: true,
  sourcemap: true,
})
