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
      sharp: path.resolve(__dirname, 'src/sharp-fix.js'),
      'ktx2-basis': path.resolve(__dirname, 'node_modules/ktx2-encoder/dist/basis/basis_encoder.js')
    }
  },
  optimization: {
    splitChunks: false,
  },
  target: 'electron-main',
  output: {
    filename: '[name].js',
    asyncChunks: false
  },
  module: {
    rules: require('./webpack.rules'),    
  },
};
