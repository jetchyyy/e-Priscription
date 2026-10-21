import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const DEFAULT_SITE_URL = 'https://e-prescription.odysseyph.com';

// Public pages search engines may list. Everything behind a login, and every prescription link, stays out.
const PUBLIC_PAGES = ['/', '/pricing', '/terms', '/privacy'];

/**
 * Fills in the site address (VITE_APP_URL) where absolute URLs are required:
 * Open Graph and canonical tags in index.html, plus robots.txt and sitemap.xml.
 */
function siteUrlPlugin(siteUrl) {
  return {
    name: 'site-url',
    transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', siteUrl),
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
      });
      const urls = PUBLIC_PAGES.map((p) => `  <url><loc>${siteUrl}${p === '/' ? '' : p}</loc></url>`).join('\n');
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const siteUrl = (env.VITE_APP_URL || DEFAULT_SITE_URL).replace(/\/$/, '');
  return {
    plugins: [react(), siteUrlPlugin(siteUrl)],
    server: { port: 5173 },
    test: { environment: 'node' },
  };
});
