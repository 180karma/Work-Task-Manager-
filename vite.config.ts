import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// WTM is plain HTML/JS and runs without a build. Vite only does two things:
// - `npm run dev` serves the whole folder, and js/app.js loads the Mail section straight from src/mail (with hot reload);
// - `npm run build` bundles src/mail into js/mail/relay-mail.js, which is committed so WTM can still be hosted as a plain folder.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  publicDir: false,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'js/mail',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    lib: {
      entry: 'src/mail/embed.tsx',
      name: 'RelayMail',
      formats: ['iife'],
      fileName: () => 'relay-mail.js',
    },
  },
});
