// Prepares dist-artifact/ for publishing as a claude.ai Artifact (hosted preview).
// The Artifact host wraps the page in its own <html>/<head>/<body>, so the page file keeps only
// the title, the stylesheet/script tags produced by Vite and the app root.
import { readFileSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const dir = 'dist-artifact';
const html = readFileSync(path.join(dir, 'index.html'), 'utf8');
const tags = [...html.matchAll(/<(script|link)\b[^>]*>(<\/script>)?/g)]
  .map((m) => m[0])
  .filter((t) => /type="module"|rel="stylesheet"|rel="modulepreload"/.test(t))
  .map((t) => (t.startsWith('<script') && !t.endsWith('</script>') ? `${t}</script>` : t));
const page = `<title>BurnMatrix</title>
<meta name="theme-color" content="#0b1730">
${tags.join('\n')}
<div id="root"></div>
<noscript>BurnMatrix requires JavaScript.</noscript>
`;
writeFileSync(path.join(dir, 'page.html'), page);
for (const f of ['sw.js', 'registerSW.js', 'manifest.webmanifest']) rmSync(path.join(dir, f), { force: true });
// Binary .glb is not a served type on the Artifact host: ship it as a JS module of base64 bytes.
for (const f of readdirSync(path.join(dir, 'models'))) {
  if (!f.endsWith('.glb')) continue;
  const b64 = readFileSync(path.join(dir, 'models', f)).toString('base64');
  writeFileSync(path.join(dir, 'models', `${f}.js`), `export default ${JSON.stringify(b64)};\n`);
  rmSync(path.join(dir, 'models', f));
}
for (const f of readdirSync(dir)) if (/^workbox-.*\.js$/.test(f)) rmSync(path.join(dir, f));

const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = path.join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(path.relative(dir, p));
  }
};
walk(dir);
const publish = files.filter((f) => f !== 'index.html' && f !== 'page.html' && !f.endsWith('.md'));
writeFileSync(path.join(dir, 'files.json'), JSON.stringify(Object.fromEntries(publish.map((f) => [f, path.join(dir, f)])), null, 2));
console.log(page);
console.log(`${publish.length} supporting files`);
