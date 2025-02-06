import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/*.ts'],
  format: 'esm',
  target: 'node18',
  clean: true,
  dts: true,
  shims: true,
})
