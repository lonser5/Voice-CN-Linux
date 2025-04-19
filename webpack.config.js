const path = require('path');

module.exports = {
  target: 'node',
  entry: './src/extension.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode',
    naudiodon: 'commonjs naudiodon'
  },
  resolve: {
    extensions: ['.js']
  },
  node: {
    __dirname: false,
    __filename: false
  }
}; 