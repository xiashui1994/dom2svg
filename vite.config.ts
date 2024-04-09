import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  server: {
    host: true,
    open: true,
  },
  build: {
    target: 'es2015',
    lib: {
      entry: resolve(__dirname, 'lib/index.ts'),
      name: 'Dom2svg',
      fileName: 'dom2svg',
    },
    rollupOptions: {
      external: ['gradient-parser', 'postcss', 'postcss-value-parser'],
      output: {
        globals: {
          'gradient-parser': 'gradientParser',
          'postcss': 'postcss',
          'postcss-value-parser': 'postcssValueParser',
        },
      },
    },
  },
  plugins: [dts({ rollupTypes: true })],
})
