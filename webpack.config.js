const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
  mode: 'development',
  entry: {
    'chrome/content/main': './src/index.js',
    'chrome/content/preferences': './src/dialogs/preferences/index.js',
    'chrome/content/editor': './src/dialogs/editor/index.js',
    'chrome/content/identifier-importer': './src/dialogs/identifier-importer/index.js'
  },
  output: {
    filename: '[name].js',
    path: __dirname + '/dist'
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: ['babel-loader']
      }
    ]
  },
  resolve: {
    extensions: ['*', '.js', '.jsx'],
    fallback: {
      'querystring': require.resolve("querystring-es3"),
      'http': false, //require.resolve('stream-http'),
      'https': false //require.resolve('https-browserify'),
      // 'url': require.resolve('url/'),
      // 'buffer': require.resolve('buffer/')
    }
  },
  optimization: {
    minimize: false
  },
  devtool: 'inline-source-map',
  externals: {
    'zotero@components/button': 'commonjs components/button',
    'zotero@components/editable': 'commonjs components/editable',
    'zotero@components/form/input': 'commonjs components/form/input',
    'zotero@react-intl': 'commonjs react-intl'
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: "static", to: "." },
        { from: "LICENSE.md", to: "." },
        {
          from: "static/chrome/locale",
          to: "./chrome/content/locale"
        },
        { from: "translators/*.js", to: "./chrome/content/translators/[name].[ext]" },
        {
          from: "translators/zotkat/Wikidata QuickStatements.js",
          to: "./chrome/content/translators"
        },
        {
          from: "Local-Citation-Network/index*",
          to: "./chrome/content/Local-Citation-Network/[name].[ext]"
        },
        {
          from: "Local-Citation-Network/lib",
          to: "./chrome/content/Local-Citation-Network/lib"
        }
      ]
    })
  ]
};
