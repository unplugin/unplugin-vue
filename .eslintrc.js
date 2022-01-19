const { defineConfig } = require('eslint-define-config')

module.exports = defineConfig({
  root: true,
  extends: ['@sxzz/eslint-config-vue', '@sxzz/eslint-config-prettier'],
  rules: {
    'import/named': 'off',
  },
})
