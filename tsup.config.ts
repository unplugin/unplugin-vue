import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['./src/*.ts'],
  format: ['esm', 'cjs'],
  target: 'node18',
  clean: true,
  dts: true,
  splitting: true,
  cjsInterop: true,
  shims: true,
})
