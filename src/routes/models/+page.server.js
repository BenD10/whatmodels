import releases from '$lib/data/releases.json';

// Only the newest release's model names reach the page, not all of
// releases.json, which grows with every data release.
export function load() {
  const { date, models_added } = releases[0];
  return { latestRelease: { date, models: models_added } };
}
