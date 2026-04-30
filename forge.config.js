const { VitePlugin } = require('@electron-forge/plugin-vite');

module.exports = {
  packagerConfig: {
    executableName: 'piio',
    icon: './app/logo.ico',
    ignore: [
      '.gitignore',
      'regions.json',
      'changelog.txt',
      'README.md',
      'scoreboard.json',
    ],
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'piio',
        title: 'Production Interface IO',
        setupIcon: './app/logo.ico',
        loadingGif: 'img/loading.gif',
      },
    },
    {
      name: '@electron-forge/maker-zip',
    },
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'app/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
};
