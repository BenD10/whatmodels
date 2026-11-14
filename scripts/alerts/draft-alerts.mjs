#!/usr/bin/env node
/**
 * Draft per-tier new-model alert emails from a data release.
 * Thin CLI over src/lib/alerts.js: reads models.json at two git refs and
 * writes <out>/README.md plus <out>/<tier>.md for every tier with news.
 * Never sends anything. Usage: see scripts/alerts/README.md.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { draftAlerts, renderReadme } from '../../src/lib/alerts.js';

const MODELS_PATH = 'src/lib/data/models.json';

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
}

function sha(ref) {
  return git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
}

function modelsAt(ref) {
  return JSON.parse(git('show', `${ref}:${MODELS_PATH}`));
}

/**
 * Default --from: the newest data-release-* tag behind --to, otherwise the
 * parent of the last commit that changed models.json.
 */
function defaultFrom(to) {
  const toSha = sha(to);
  const tags = git('tag', '--list', 'data-release-*', '--merged', to, '--sort=-creatordate')
    .split('\n')
    .filter(Boolean);
  const tag = tags.find((t) => sha(t) !== toSha);
  if (tag) return tag;
  const last = git('log', '-1', '--format=%H', to, '--', MODELS_PATH);
  if (!last) throw new Error(`no commit behind ${to} changes ${MODELS_PATH}`);
  return `${last}^`;
}

function localDate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function main() {
  const { values } = parseArgs({
    options: {
      from: { type: 'string' },
      to: { type: 'string', default: 'HEAD' },
      out: { type: 'string' },
      date: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help || !values.out) {
    console.log('Usage: node scripts/alerts/draft-alerts.mjs --out <dir> [--from <ref>] [--to <ref>] [--date YYYY-MM-DD]');
    process.exit(values.help ? 0 : 1);
  }

  const to = values.to;
  const from = values.from ?? defaultFrom(to);
  const date = values.date ?? localDate();
  const result = draftAlerts(modelsAt(from), modelsAt(to));
  const label = (ref) => {
    const short = sha(ref).slice(0, 7);
    return short.startsWith(ref) ? short : `${ref} (${short})`;
  };
  const readme = renderReadme(result, { from: label(from), to: label(to), date });

  mkdirSync(values.out, { recursive: true });
  writeFileSync(join(values.out, 'README.md'), readme);
  for (const t of result.tiers) {
    if (t.email) writeFileSync(join(values.out, `${t.tier}.md`), t.email);
  }

  const sent = result.tiers.filter((t) => t.email);
  console.log(`${from}..${to}: ${result.newGroups.length} new model(s)`);
  for (const t of sent) console.log(`  ${t.tier}.md  ${t.picks.length} model(s)`);
  console.log(`Wrote ${sent.length} draft(s) and README.md to ${values.out}`);
}

main();
