/** Builds `ui/ui.js`, the single browser module the gateway serves for this plugin. */
import { defineConfig } from 'vite'

/** Specifiers answered by the host import map; bundling them puts a second React in the page. */
const HOST_PROVIDED = ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom']

export default defineConfig({
  build: {
    lib: { entry: 'src/ui/index.tsx', formats: ['es'], fileName: () => 'ui.js' },
    outDir: 'ui',
    emptyOutDir: true,
    minify: false,
    target: 'es2023',
    rollupOptions: { external: HOST_PROVIDED },
  },
  esbuild: { jsx: 'automatic' },
})
