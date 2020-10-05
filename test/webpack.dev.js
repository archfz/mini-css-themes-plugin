const path = require('path');
const merge = require('webpack-merge');

process.env.NODE_ENV = 'development';
const common = require('./webpack.config.js');

module.exports = merge.smartStrategy({
  externals: 'replace',
  plugins: 'prepend',
  entry: 'merge',
  optimization: 'replace',
})(common, {
  mode: 'development',
  output: {
    pathinfo: false
  },
  devServer: {
    contentBase: path.join(__dirname, 'dist'),
    disableHostCheck: true,
    historyApiFallback: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
});
