#!/usr/bin/env node
/**
 * Regenerates search-index.json by scanning all public .html pages.
 * Runs automatically on every Vercel deploy (see package.json "build").
 * No dependencies — pure Node fs + regex.
 */
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = ['admin', 'api', 'node_modules', 'scripts', '.git', '.github', 'v1.3-backup', 'v1.4'];
const SKIP_FILES = ['404.html'];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(ROOT, full);
    if (SKIP_DIRS.some(d => rel === d || rel.startsWith(d + '/'))) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith('.html') && !SKIP_FILES.includes(name) && !name.startsWith('test-')) out.push(rel);
  }
  return out;
}

function unescapeHtml(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&rsquo;/g, '\u2019')
          .replace(/&mdash;/g, '\u2014').replace(/&amp;/g, '&');
}

function toUrl(rel) {
  const u = rel.replace(/\.html$/, '');
  return u === 'index' ? '/' : '/' + u;
}

function categorize(rel) {
  if (rel.startsWith('blog/')) return 'Blog';
  if (rel.startsWith('services/')) return 'Service';
  if (rel.startsWith('security-systems-')) return 'Location';
  if (/(banking|pharma|manufacturing|education|corporate|retail)/.test(rel) || rel === 'industries.html') return 'Industry';
  return 'Page';
}

const pages = walk(ROOT).filter(p => !p.startsWith('test'));
const index = [];
for (const rel of pages) {
  const html = readFileSync(join(ROOT, rel), 'utf8');
  const t = html.match(/<title>([^<]*)<\/title>/i);
  const d = html.match(/<meta name="description" content="([^"]*)"/i);
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = t ? unescapeHtml(t[1].replace(/\s*[|\u2014-]\s*ISE.*$/, '').trim()) : rel;
  const desc = d ? unescapeHtml(d[1]) : '';
  const h1t = h1 ? unescapeHtml(h1[1].replace(/<[^>]+>/g, '').trim()) : '';
  index.push({ t: title, u: toUrl(rel), d: desc, c: categorize(rel), h: h1t });
}

writeFileSync(join(ROOT, 'search-index.json'), JSON.stringify(index));
console.log(`[build-search-index] Indexed ${index.length} pages -> search-index.json`);
