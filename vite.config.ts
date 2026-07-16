import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // Em desenvolvimento local, encaminha /api para o servidor Express local
      // (rode `npm run dev:api` em outro terminal). Na Vercel isso nao e usado,
      // pois la o /api ja e servido nativamente pelas funcoes serverless.
      proxy: {
        '/api': {
          target: `http://localhost:${process.env.API_PORT || 8787}`,
          changeOrigin: true,
        },
      },
    },
  };
});
