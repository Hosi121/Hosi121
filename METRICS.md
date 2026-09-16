# Updating the profile

The SVGs are snapshots, not live embeds. Generate them locally with Node.js,
an authenticated GitHub CLI (`gh`), and Chromium:

```sh
git clone --depth 1 --branch v3.34 https://github.com/lowlighter/metrics.git /tmp/hosi-metrics
cd /tmp/hosi-metrics
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
npm rebuild sharp
cd /path/to/Hosi121
METRICS_DIR=/tmp/hosi-metrics node refresh-metrics.mjs
```

Set `PUPPETEER_BROWSER_PATH` if Chromium is not on PATH. No Docker or browser
download is required. The script reads the existing CLI credential in memory;
do not put a token in this repository or commit generation logs.

`refresh-metrics.mjs` generates the calendar, issue/PR and language charts,
and seven detailed achievements (rank B or above). It fetches repository data
in smaller pages, works around Metrics v3.34's pagination issue, and excludes
the Manager achievement because GitHub's Classic Projects API was retired.
The display name is consistently rendered as Hosi121.

Counts reflect the API data available to the authenticated account, including
accessible private repository aggregates; they are not public-only totals.
Repository names from private projects are not intentionally displayed.

The two linked repository introductions are separately maintained SVGs with
transparent backgrounds and no statistics. Check their text and layout, as
well as the generated SVGs, before committing and pushing a refresh.
