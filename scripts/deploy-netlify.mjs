/**
 * Publishes dist/ (from `npm run build:netlify`) to Netlify with the file-digest API:
 * only changed files are uploaded. Usage:
 *
 *   NETLIFY_AUTH_TOKEN=<personal access token> node scripts/deploy-netlify.mjs [--dry-run]
 *
 * The first run creates the site (named "burnmatrix", or "burnmatrix-<n>" if taken) and records
 * its id in netlify-site.json, which later runs reuse. The token is never written to disk.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const API = 'https://api.netlify.com/api/v1';
const DIST = 'dist';
const SITE_FILE = 'netlify-site.json';
const NAMES = ['burnmatrix', 'burnmatrix-app', 'burnmatrix-web', 'burnmatrix-tool'];
const dryRun = process.argv.includes('--dry-run');
const token = process.env.NETLIFY_AUTH_TOKEN || 'set-by-proxy';

async function api(method, path, body, contentType = 'application/json') {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType, 'User-Agent': 'burnmatrix-deploy' },
    body: body === undefined ? undefined : contentType === 'application/json' ? JSON.stringify(body) : body,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { ok: res.ok, status: res.status, json };
}

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

if (!existsSync(join(DIST, 'index.html')) || !existsSync(join(DIST, '_redirects'))) {
  console.error('dist/ is not a Netlify build. Run `npm run build:netlify` first.');
  process.exit(1);
}

const files = {};
const byHash = new Map();
for (const p of walk(DIST)) {
  const key = '/' + relative(DIST, p).split(sep).join('/');
  const sha = createHash('sha1').update(readFileSync(p)).digest('hex');
  files[key] = sha;
  if (!byHash.has(sha)) byHash.set(sha, []);
  byHash.get(sha).push(key);
}
console.log(`${Object.keys(files).length} files in dist/`);
if (dryRun) process.exit(0);

let site = existsSync(SITE_FILE) ? JSON.parse(readFileSync(SITE_FILE, 'utf8')) : null;
if (site) {
  const r = await api('GET', `/sites/${site.siteId}`);
  if (!r.ok) {
    console.error(`Recorded site ${site.siteId} not reachable (HTTP ${r.status}).`, r.json);
    process.exit(1);
  }
} else {
  for (const name of NAMES) {
    const r = await api('POST', '/sites', { name });
    if (r.ok) {
      site = { siteId: r.json.id, name: r.json.name, url: r.json.ssl_url || r.json.url };
      writeFileSync(SITE_FILE, JSON.stringify(site, null, 2) + '\n');
      console.log(`Created site ${site.name} (${site.url})`);
      break;
    }
    if (r.status === 401 || r.status === 403) {
      console.error(`Netlify refused the request (HTTP ${r.status}): the access token is missing or invalid.`);
      process.exit(1);
    }
    console.log(`Name "${name}" not available (HTTP ${r.status}).`);
  }
  if (!site) {
    console.error('Could not create a site with any of the names:', NAMES.join(', '));
    process.exit(1);
  }
}

const created = await api('POST', `/sites/${site.siteId}/deploys`, { files, async: false });
if (!created.ok) {
  console.error(`Creating the deploy failed (HTTP ${created.status}).`, created.json);
  process.exit(1);
}
const deploy = created.json;
const required = deploy.required ?? [];
console.log(`Deploy ${deploy.id}: uploading ${required.length} changed file(s)`);
for (const sha of required) {
  for (const key of byHash.get(sha) ?? []) {
    const body = readFileSync(join(DIST, key.slice(1)));
    const encoded = key.split('/').map(encodeURIComponent).join('/');
    let r;
    for (let attempt = 1; attempt <= 4; attempt++) {
      r = await api('PUT', `/deploys/${deploy.id}/files${encoded}`, body, 'application/octet-stream');
      if (r.ok) break;
      await new Promise((res) => setTimeout(res, attempt * 2000));
    }
    if (!r.ok) {
      console.error(`Upload of ${key} failed (HTTP ${r.status}).`, r.json);
      process.exit(1);
    }
  }
}

for (let i = 0; i < 60; i++) {
  const r = await api('GET', `/deploys/${deploy.id}`);
  const state = r.json?.state;
  if (state === 'ready') {
    console.log(`Live: ${site.url}`);
    process.exit(0);
  }
  if (state === 'error') {
    console.error('Netlify reported a deploy error:', r.json?.error_message);
    process.exit(1);
  }
  await new Promise((res) => setTimeout(res, 3000));
}
console.error('Timed out waiting for the deploy to become ready.');
process.exit(1);
