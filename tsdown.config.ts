import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/*.ts'],
  exports: true,
  shims: true,
})
