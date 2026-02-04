
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // WICHTIG: './' sorgt dafür, dass die App relativ zum aktuellen Ordner lädt.
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // pdfjs-dist benötigt 'esnext' oder mindestens 'es2022' für top-level await Support
    target: 'esnext'
  },
  optimizeDeps: {
    esbuildOptions: {
      // Dies behebt den Fehler im Development Modus
      target: 'esnext'
    }
  },
  server: {
    port: 3000
  }
})
