import Vue from 'unplugin-vue/webpack'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import { type Configuration } from 'webpack'

const config: Configuration = {
  mode: (process.env.MODE as any) ?? 'development',
  entry: {
    app: './src/main.ts',
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
