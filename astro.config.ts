import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

import icon from 'astro-icon'

// https://astro.build/config
export default defineConfig({
  site: 'https://owo.rcw.lol',
  // Astro 7 defaults to JSX whitespace stripping. Keep the pre-v7 HTML-aware
  // behavior so spacing between inline elements is preserved.
  compressHTML: true,
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    sitemap(),
    react(),
    icon(),
  ],
  server: {
    port: 1234,
    host: true,
  },
  devToolbar: {
    enabled: true,
  },
})
