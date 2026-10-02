import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://ballerleagueukhub.com',
  output: 'static',
  // Inline styles into the HTML so there is no render-blocking CSS request
  // (improves First Contentful Paint / Largest Contentful Paint).
  build: { inlineStylesheets: 'always' },
});
