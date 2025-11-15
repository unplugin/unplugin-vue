import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/*.ts'],
  exports: true,
  inlineOnly: ['slash', '@jridgewell/gen-mapping'],
})
