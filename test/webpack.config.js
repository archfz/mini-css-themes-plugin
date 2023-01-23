const path = require('path');
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const MiniCssThemesWebpackPlugin = require('..');
const {WebpackManifestPlugin} = require('webpack-manifest-plugin');

let plugin;

if (process.env._TEST_TYPE === 'multi-entries') {
  process.env.MULTI_ENTRIES = true;
  plugin = new MiniCssThemesWebpackPlugin({
    themes: {
      default: {
        main: './themes/default.scss',
        composers: './themes/default_composers.scss'
      },
      dark: {
        main: './themes/dark.scss',
        composers: './themes/dark_composers.scss'
      },
    },
    defaultTheme: 'default'
  });
} else {
  plugin = new MiniCssThemesWebpackPlugin({
    themes: {
      default: './themes/default.scss',
      dark: './themes/dark.scss',
    },
    defaultTheme: 'default'
  });
}

module.exports = {
  entry: {
    "main": process.env.MULTI_ENTRIES
      ? path.resolve(__dirname, './src/ThemedComponentMultiEntries.jsx')
      : path.resolve(__dirname, './src/ThemedComponent.jsx'),
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
    new WebpackManifestPlugin(),
    new MiniCssExtractPlugin({ filename: "[name].css" }),
    new CleanWebpackPlugin(),
    plugin
  ]
};
