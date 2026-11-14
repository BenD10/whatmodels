import gpus from '$lib/data/gpus.json';
import models from '$lib/data/models.json';
import releases from '$lib/data/releases.json';
import { releaseView } from '$lib/releases.js';

// Served as new/index.html (/new/), beside the new/<date> pages: a new.html
// next to a new/ directory would be shadowed on GitHub Pages (see /data/).
export const trailingSlash = 'always';

// A server load, so models.json stays out of this page's JavaScript: the page
// only needs the resolved release, not the whole database.
export function load() {
  const [latest, ...past] = releases.map((r) => releaseView(r, models, gpus));
  return {
    latest,
    past: past.map(({ date, title, summary, path, dateLabel, countsLabel }) => ({ date, title, summary, path, dateLabel, countsLabel })),
  };
}
