const merge = require('webpack-merge');

process.env.NODE_ENV = 'production';
const common = require('./webpack.config.js');

module.exports = merge.smartStrategy({
  optimization: "merge",
})(common, {
  mode: 'production',
  optimization: {
    minimize: false,
    usedExports: true,
  },
});
