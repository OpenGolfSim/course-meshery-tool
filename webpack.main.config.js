// const ThreadsPlugin = require('threads-plugin');
const path = require('path');

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
      sharp: path.resolve(__dirname, 'src/sharp-fix.js')
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
