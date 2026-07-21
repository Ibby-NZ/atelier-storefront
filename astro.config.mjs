import { defineConfig } from 'astro/config'
import react from '@astrojs/react'

// Storefront config. React powers the interactive islands (filters, cart,
// forms); everything else ships as static HTML. Dev server port kept off the
// API's 3001 so both can run side by side.
export default defineConfig({
  integrations: [react()],
  server: {
    port: 4321,
    host: true,
  },
})
