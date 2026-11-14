import { error } from '@sveltejs/kit';
import gpus from '$lib/data/gpus.json';
import models from '$lib/data/models.json';
import releases from '$lib/data/releases.json';
import { releasePath, releaseView } from '$lib/releases.js';

export function entries() {
  return releases.map((r) => ({ date: r.date }));
}

// A server load, so models.json stays out of this page's JavaScript
export function load({ params }) {
  const i = releases.findIndex((r) => r.date === params.date);
  if (i === -1) error(404, 'Release not found');
  const link = (r) => (r ? { date: r.date, title: r.title, path: releasePath(r.date) } : null);
  return {
    release: releaseView(releases[i], models, gpus),
    // releases.json is newest first
    newer: link(releases[i - 1]),
    older: link(releases[i + 1]),
  };
}
