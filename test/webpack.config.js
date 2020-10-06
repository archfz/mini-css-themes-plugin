const path = require('path');
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const MiniCssThemesWebpackPlugin = require('..');
const ManifestPlugin = require('webpack-manifest-plugin');

module.exports = {
  entry: {
    "main": path.resolve(__dirname, './src/index.jsx'),
  },
  devtool: 'source-map',
  output: {
    path: path.resolve(__dirname, './dist'),
    filename: '[name].js',
    library: 'Main',
    libraryTarget: 'umd',
  },
  externals: {
    'react': 'React',
    'react-dom': 'ReactDOM',
  },
  resolve: {
    extensions: ['.jsx', '.js'],
    symlinks: false,
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader"
        }
      },
      {
        test:  /\.css$/i,
        include: [
          path.resolve(__dirname, 'src'),
        ],
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: 'css-loader',
            options: {
              importLoaders: 2,
              sourceMap: true,
              modules: false,
            }
          }
        ]
      },
      {
        test: /\.s[ac]ss$/,
        include: [
          path.resolve(__dirname, 'src'),
        ],
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: 'css-loader',
            options: {
              importLoaders: 2,
              sourceMap: true,
              modules: {
                localIdentName: '[name]__[local]___[hash:base64:5]'
              },
            }
          },
          {
            loader: 'postcss-loader',
            options: {
              sourceMap: true
            }
          },
          {
            loader: 'sass-loader',
            options: {
              sourceMap: true
            }
          }
        ]
      },
    ]
  },
  stats: {
    children: false
  },
  plugins: [
    new ManifestPlugin(),
    new MiniCssExtractPlugin({ filename: "[name].css" }),
    new CleanWebpackPlugin(),
    new MiniCssThemesWebpackPlugin({
      themes: {
        default: './themes/default.scss',
        dark: './themes/dark.scss',
      },
      defaultTheme: 'default'
    })
  ]
};
