const process = require('node:process')
const rspack = require('@rspack/core')
const Vue = require('unplugin-vue/rspack')

/** @type {import('@rspack/core').Configuration} */
const config = {
  mode: process.env.MODE ?? 'development',
  entry: {
    app: './src/main.ts',
  },
  module: {
    rules: [
      {
        enforce: 'post',
        test: /\.m?ts$/,
        exclude: /(node_modules)/,
        use: { loader: 'swc-loader' },
      },
    ],
  },
  plugins: [
    Vue(),
    new rspack.HtmlRspackPlugin({
      filename: 'index.html',
      template: 'public/index.html',
    }),
  ],
}
module.exports = config
