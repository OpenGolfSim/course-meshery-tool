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
  resolve: {
    alias: {
      sharp: false
    }
  },
  target: 'electron-main',
  output: {
    filename: '[name].js',
  },
  module: {
    rules: require('./webpack.rules'),    
  },
};
