// const ThreadsPlugin = require('threads-plugin');

module.exports = {
  entry: {
    index: './src/main.js',
    'svg.worker': './src/lib/workers/svg.worker.js',
  },
  target: 'electron-main',
  output: {
    filename: '[name].js',
  },
  // Put your normal webpack config below here
  module: {
    rules: require('./webpack.rules'),    
  },
  // plugins: [
  //   new ThreadsPlugin({
  //     target: 'electron-node', // important for Electron main process
  //   }),
  // ],
};
