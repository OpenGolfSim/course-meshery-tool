const path = require('path');
const rules = require('./webpack.rules');

rules.push({
  test: /\.css$/,
  use: [{ loader: 'style-loader' }, { loader: 'css-loader' }],
});

rules.push({
  test: /\.webworker\.js$/, // Ensure Web Workers are handled correctly
  use: {
    loader: 'worker-loader',
    options: {
      filename: '[name].webworker.[contenthash].js', // Unique output name for workers
      esModule: false, // Disable ES Module syntax in output
    },
  },
});

module.exports = {
  // Put your normal webpack config below here
  module: {
    rules,
  },
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'],
    alias: {
      // Manually map the missing module to its actual location in node_modules
      'georaster-stack/web': path.resolve(__dirname, 'node_modules/georaster-stack/web/index.js'),
      'georaster': path.resolve(__dirname, 'node_modules/georaster/dist/georaster.browser.bundle.min.js'),
    },
    mainFields: ['browser', 'module', 'main'],
  },  

  stats: {
    children: true,
    errorDetails: true,
  }
};
