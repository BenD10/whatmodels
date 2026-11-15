import releases from '$lib/data/releases.json';

// Only the newest release's date, title and model names reach the page, not
// all of releases.json, which grows with every data release.
export function load() {
  const { date, title, models_added } = releases[0];
  return { latestRelease: { date, title, models: models_added } };
}
