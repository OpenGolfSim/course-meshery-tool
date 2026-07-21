const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    name: 'Meshery',
    authors: 'OpenGolfSim',
    description: 'OpenGolfSim Meshery is a tool for converting and building you course meshes',
    // asar: true,
    icon: 'images/Meshery',
    appCategoryType: 'public.app-category.developer-tools',
    extraResource: [
      './extra-resources'
    ],
    asar: {
      unpack: '**/.webpack/main/*.worker.js',
    },
    ...process.env.OSX_SIGN && {
      osxSign: {
        identity: process.env.APPLE_SIGNING_IDENTITY,
        hardenedRuntime: true
      },
      osxNotarize: {
        tool: 'notarytool',
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_ID_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID
      },
    }
  },
  rebuildConfig: {},
  makers: [
    // {
    //   name: '@electron-forge/maker-squirrel',
    //   config: {},
    // },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32'],
    },
    // {
    //   name: '@electron-forge/maker-deb',
    //   config: {},
    // },
    // {
    //   name: '@electron-forge/maker-rpm',
    //   config: {},
    // },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-webpack',
      config: {
        port: 3102,
        mainConfig: './webpack.main.config.js',
        renderer: {
          config: './webpack.renderer.config.js',
          entryPoints: [
            {
              html: './src/index.html',
              js: './src/renderer.js',
              name: 'main_window',
              preload: {
                js: './src/preload.js',
              },
            },
            {
              html: './src/trees/tree.html',
              js: './src/trees/tree_renderer.js',
              name: 'tree_window',
              preload: {
                js: './src/trees/preload.js',
              },
            }
          ],
        },
        devContentSecurityPolicy: [
          "default-src 'self' blob: data: gap:",
          "style-src 'self' 'unsafe-inline' blob: data: gap:",
          "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: data: gap:",
          "object-src 'self' blob: data: gap:",
          "img-src 'self' blob: data: gap: *.opengolfsim.com *.openstreetmap.org *.arcgisonline.com mt.google.com *.virtualearth.net",
          "connect-src 'self' https://*.mapbox.com blob: data: gap: project: laz:",
          "frame-src 'self' blob: data: gap:",
          "worker-src 'self' blob: data: gap:"
        ].join('; ')
      },
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
