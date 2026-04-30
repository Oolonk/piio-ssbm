import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'window/main.html'),
        database: path.resolve(__dirname, 'window/database.html'),
        settings: path.resolve(__dirname, 'window/settings.html'),
        overlays: path.resolve(__dirname, 'window/overlays.html'),
        matchlist: path.resolve(__dirname, 'window/matchlist.html'),
        shortcuts: path.resolve(__dirname, 'window/shortcuts.html'),
        assets: path.resolve(__dirname, 'window/assets.html'),
        connections: path.resolve(__dirname, 'window/connections.html'),
        splash: path.resolve(__dirname, 'window/splash.html'),
        'database-entry': path.resolve(__dirname, 'window/database-entry.html'),
        'database-entry-player': path.resolve(__dirname, 'window/database-entry-player.html'),
      },
    },
  },
});
