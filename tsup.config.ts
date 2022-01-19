import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['./src/*.ts'],
  format: ['esm', 'cjs'],
  target: 'node12',
  clean: true,
  dts: true,
  sourcemap: true,
  splitting: true,
})
