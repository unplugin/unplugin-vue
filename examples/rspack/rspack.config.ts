import process from 'node:process'
import { HtmlRspackPlugin, type Configuration } from '@rspack/core'
import Vue from 'unplugin-vue/rspack'

const config: Configuration = {
  mode: (process.env.MODE as Configuration['mode']) ?? 'development',
  entry: {
    app: './src/main.ts',
  },
  module: {
    rules: [
      {
        enforce: 'post',
        test: /\.m?ts$/,
        exclude: /node_modules/,
        loader: 'builtin:swc-loader',
        options: {
          jsc: {
            parser: {
              syntax: 'typescript',
            },
          },
        },
        type: 'javascript/auto',
      },
      {
        test: /\.css$/,
        enforce: 'post',
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [
    Vue(),
    new HtmlRspackPlugin({
      filename: 'index.html',
      template: 'public/index.html',
    }),
  ],
}
export default config
