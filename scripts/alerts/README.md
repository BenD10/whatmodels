# New-model alert drafts

`draft-alerts.mjs` writes one Markdown email per Buttondown VRAM tier for the models a data release added. It only writes files: it never calls the Buttondown API or sends anything. The owner reviews each draft and sends it from Buttondown.

Run it from the repo root after each data release:

```bash
node scripts/alerts/draft-alerts.mjs --from <git-ref> --to <git-ref> --out <dir> [--date YYYY-MM-DD]

# e.g. the November 2026 release, into the biz repo
node scripts/alerts/draft-alerts.mjs --from ef9d11a --to origin/data/nov-2026 \
    --out ~/whatmodels/biz/drafts/2026-11-13
```

| Option | Default | |
| --- | --- | --- |
| `--out` | (required) | Folder for the drafts; created if missing. Existing files with the same names are overwritten. |
| `--to` | `HEAD` | Ref with the new `models.json`. |
| `--from` | see below | Ref with the old `models.json`. |
| `--date` | today | Date shown in `README.md`. |

Without `--from`, the script uses the newest `data-release-*` tag behind `--to`, or, if there are none, the parent of the last commit that changed `src/lib/data/models.json`. That only covers the last data commit, so pass `--from` when a release spans several commits.

## Output

- `<out>/README.md`: the new models, a table of the tiers that get an email with the Buttondown filter for each (`metadata vram_tier = <tier>`), the tiers skipped for having nothing new, and any new models too big for every tier.
- `<out>/<tier>.md` for each tier with news. The first line is the subject; paste everything below the first `---` into the Buttondown body. The footer has an `{{ unsubscribe_url }}` link.

## How it decides

- **New model:** a base model (`name`, as grouped by `groupVariants()`) present at `--to` but not at `--from`. New quantizations of an existing model don't count.
- **Tiers:** `VRAM_TIERS` and `TOP_TIER_GB` from `src/lib/notify.js`: `vram-lt4`, `vram-4`, `vram-6`, `vram-8`, `vram-12`, `vram-16`, `vram-24`, `vram-32plus`. Each means "at least N GB", so a model is checked at the tier's floor. `vram-lt4` would be 0 GB, so it is checked at 2 GB.
- **Runs well:** the site's `bucketModels()` "fits" bucket at the floor, with bandwidth unknown and no offload: the weights fit and there is room for at least `TIGHT_FIT_CONTEXT_K` (16K) of context. Each model shows the highest-precision variant that runs well (`bestVariantFor()`, as on the model pages).

The logic is in `src/lib/alerts.js`, tested by `src/lib/alerts.test.js` (`npm test`); this script only reads git and writes files.
