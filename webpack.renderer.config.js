const rules = require('./webpack.rules');

rules.push({
  test: /\.css$/,
  use: [{ loader: 'style-loader' }, { loader: 'css-loader' }],
});

rules.push({
  test: /\.worker\.js$/, // Ensure Web Workers are handled correctly
  use: {
    loader: 'worker-loader',
    options: {
      filename: '[name].worker.[contenthash].js', // Unique output name for workers
      esModule: false, // Disable ES Module syntax in output
    },
  },
});

module.exports = {
  // Put your normal webpack config below here
  module: {
    rules,
  }
};
