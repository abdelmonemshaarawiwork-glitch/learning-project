/**
 * Adds Netlify configuration files to dist/ after `vite build` (root path):
 *  - _redirects: every unknown path opens the app (single-page app routing)
 *  - _headers:   security headers; long cache for hashed assets; no cache for the service worker
 * They are written here (not in public/) so other build targets do not ship them.
 */
import { writeFileSync } from 'node:fs';

writeFileSync('dist/_redirects', '/*    /index.html    200\n');
writeFileSync(
  'dist/_headers',
  `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
/sw.js
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
/assets/*
  Cache-Control: public, max-age=31536000, immutable
`,
);
console.log('Netlify files written: dist/_redirects, dist/_headers');
