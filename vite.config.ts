import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  build: {
    target: 'es2015',
    lib: {
      entry: './lib/index.ts',
      name: 'Dom2svg',
      fileName: 'dom2svg',
    },
  },
  plugins: [dts({
    entryRoot: 'lib',
    outDir: 'dist/types',
    staticImport: true,
    insertTypesEntry: true,
  })],
})
