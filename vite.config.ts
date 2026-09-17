import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {createRequire} from 'module';
import {defineConfig, loadEnv} from 'vite';

const require = createRequire(import.meta.url);
const pkg = require('./package.json') as {version: string};

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    // Single source of truth for the version shown in the UI: package.json.
    // The strings it replaces (v1.0.4-RELAY, Contract: v1.0.4) were invented
    // and corresponded to nothing.
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __BUILD_COMMIT__: JSON.stringify(
        (env.BUILD_COMMIT || env.RENDER_GIT_COMMIT || env.GITHUB_SHA || 'dev').slice(0, 7),
      ),
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
