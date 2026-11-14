import gpus from '$lib/data/gpus.json';
import models from '$lib/data/models.json';
import releases from '$lib/data/releases.json';
import { buildFeed, releaseView } from '$lib/releases.js';

export const prerender = true;

export function GET() {
  const xml = buildFeed(releases.map((r) => releaseView(r, models, gpus)));
  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
}
