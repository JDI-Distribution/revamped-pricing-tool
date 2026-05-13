import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: '/app/',
  build: {
    rollupOptions: {
      output: {
        assetFileNames: `assets/[name]_[hash:8].[ext]`,
        chunkFileNames: 'assets/[name]_[hash:8].js',
        entryFileNames: 'assets/[name]_[hash:8].js',
      },
    },
  },
})
