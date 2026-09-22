import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

import cloudflare from '@astrojs/cloudflare'
import icon from 'astro-icon'

export default defineConfig({
  site: 'https://tv.rcw.lol',
  output: 'server',
  adapter: cloudflare(),
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
