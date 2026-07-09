// const ThreadsPlugin = require('threads-plugin');
const webpack = require('webpack');

module.exports = {
  entry: {
    index: './src/main.js',
    'svg.worker': './src/lib/workers/svg.worker.js',
    'terrain.worker': './src/lib/workers/terrain.worker.js',
    'mesh.worker': './src/lib/workers/mesh.worker.js',
    'export.worker': './src/lib/workers/export.worker.js',
  },
  plugins: [
    new webpack.IgnorePlugin({ resourceRegExp: /^sharp$/ })
  ],
  target: 'electron-main',
  output: {
    filename: '[name].js',
  },
  module: {
    rules: require('./webpack.rules'),    
  },
};
