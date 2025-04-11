import process from 'node:process'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import Vue from 'unplugin-vue/webpack'

/** @type import('webpack').Configuration */
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
        exclude: /node_modules/,
        use: { loader: 'swc-loader' },
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
    new HtmlWebpackPlugin({
      filename: 'index.html',
      template: 'public/index.html',
    }),
  ],
}
export default config
