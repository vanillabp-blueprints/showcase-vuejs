import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// index.html is the shell. Every other file lies below /assets/, which the backend serves.
export default defineConfig({
  plugins: [vue()],
  build: { outDir: 'dist', assetsDir: 'assets' },
});
