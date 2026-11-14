#!/usr/bin/env node
// Page-weight budgets for the static build. Run after `npm run build`:
//
//   node scripts/perf/check-budgets.js            # check, exit 1 if over budget
//   node scripts/perf/check-budgets.js --report   # also print every route's numbers
//   node scripts/perf/check-budgets.js --json     # measurements as JSON
//
// `npm run test:perf` builds first. Budgets live in budgets.js.

import { existsSync, statSync, appendFileSync } from 'node:fs';
import { join, relative, sep, posix } from 'node:path';
import { budgets } from './budgets.js';
import { measurePage, checkBudgets, listFiles, routeOf, fmt } from './inspect.js';

const args = process.argv.slice(2);
const buildDir = args.find((a) => !a.startsWith('--')) ?? 'build';
const report = args.includes('--report');
const asJson = args.includes('--json');

if (!existsSync(join(buildDir, 'index.html'))) {
  console.error(`No ${buildDir}/index.html. Run \`npm run build\` first (or \`npm run test:perf\`, which builds).`);
  process.exit(2);
}

const basePath = process.env.BASE_PATH ?? '';
const rel = (file, root) => relative(root, file).split(sep).join(posix.sep);
const pages = listFiles(buildDir, ['.html']).map((file) => measurePage(buildDir, file, { basePath }));
const ogDir = join(buildDir, 'og');
const ogImages = existsSync(ogDir) ? listFiles(ogDir, ['.png', '.jpg', '.webp']).map((file) => ({ file: rel(file, buildDir), raw: statSync(file).size })) : [];
const staticFiles = existsSync('static') ? listFiles('static', ['']).map((file) => ({ file: rel(file, 'static'), raw: statSync(file).size })) : [];

if (asJson) {
  console.log(JSON.stringify({ pages, ogImages, staticFiles }, null, 2));
  process.exit(0);
}

// Largest value per route, which is what the budget has to cover
const METRICS = ['jsGzip', 'cssGzip', 'htmlGzip', 'jsFiles', 'blockingStylesheets'];
const summary = new Map();
for (const page of pages) {
  const route = routeOf(page.page, budgets.routes) ?? '(no route)';
  const row = summary.get(route) ?? { pages: 0 };
  row.pages++;
  for (const m of METRICS) row[m] = Math.max(row[m] ?? 0, page[m]);
  summary.set(route, row);
}

if (report) {
  const header = ['route', 'pages', ...METRICS];
  const rows = [...summary].map(([route, row]) => {
    const limits = { ...budgets.defaults, ...budgets.perRoute?.[route] };
    return [route, String(row.pages), ...METRICS.map((m) => `${fmt(m, row[m])} / ${fmt(m, limits[m])}`)];
  });
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  console.log('Largest value per route / budget\n');
  console.log(line(header));
  for (const r of rows) console.log(line(r));
  const ogMax = Math.max(0, ...ogImages.map((o) => o.raw));
  const imgMax = Math.max(0, ...pages.flatMap((p) => p.images.map((i) => i.raw ?? 0)));
  console.log(`\nLargest <img>: ${fmt('bytes', imgMax)} / ${fmt('bytes', budgets.imageBytes)}`);
  console.log(`Largest OG image: ${fmt('bytes', ogMax)} / ${fmt('bytes', budgets.ogImageBytes)} (${ogImages.length} images)`);
  console.log(`Largest static/ file: ${fmt('bytes', Math.max(0, ...staticFiles.map((f) => f.raw)))} / ${fmt('bytes', budgets.staticFileBytes)}\n`);
}

// In GitHub Actions, put the table on the run's summary page too
if (process.env.GITHUB_STEP_SUMMARY) {
  const md = ['### Page-weight budgets (largest page per route / budget)', '', `| route | pages | ${METRICS.join(' | ')} |`, `|${'---|'.repeat(METRICS.length + 2)}`];
  for (const [route, row] of summary) {
    const limits = { ...budgets.defaults, ...budgets.perRoute?.[route] };
    md.push(`| ${route} | ${row.pages} | ${METRICS.map((m) => `${fmt(m, row[m])} / ${fmt(m, limits[m])}`).join(' | ')} |`);
  }
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n\n');
}

const failures = checkBudgets({ pages, ogImages, staticFiles }, budgets);
const blocking = failures.filter((f) => !f.pending);
const pending = failures.filter((f) => f.pending);

for (const f of pending) {
  const more = f.count > 1 ? ` (and ${f.count - 1} more like it)` : '';
  console.log(`warning [${f.rule}] ${f.message}${more}\n  known, not blocking: ${f.pending}`);
}
// The same rule broken on 100 GPU pages is one problem: show a few of each
const shown = new Map();
for (const f of blocking) {
  const n = (shown.get(f.rule) ?? 0) + 1;
  shown.set(f.rule, n);
  if (n <= 5) console.log(`FAIL [${f.rule}] ${f.message}`);
}
for (const [rule, n] of shown) if (n > 5) console.log(`FAIL [${rule}] ... and ${n - 5} more`);

// A pending exemption whose problem has gone should be deleted, so it can't hide a new one
const stale = Object.keys(budgets.pending ?? {}).filter((rule) => !pending.some((f) => f.rule === rule));
for (const rule of stale) console.log(`note: budgets.pending['${rule}'] no longer matches anything; delete it from scripts/perf/budgets.js`);

console.log(
  `\n${pages.length} pages, ${ogImages.length} OG images: ` +
    (blocking.length ? `${blocking.length} over budget` : 'all within budget') +
    (pending.length ? `, ${pending.length} known issue(s) waiting on a fix` : '')
);
process.exit(blocking.length ? 1 : 0);
