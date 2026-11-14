# Yusuf Wadi: portfolio ("Circuit Mind")

A single-page portfolio. The landing view is a glass head in profile. Each brain lobe is one section
(Projects, Work, Research, Worlds, Craft). Clicking a lobe dives into a 3D graph of that section's items,
and clicking a node opens its card. Visited items wire copper traces onto that lobe's circuit board. Wiring every
lobe closes the circuit and opens an easter egg showing what's Now/Next. `#list` is a plain, accessible view of
everything, and it is what visitors without WebGL get. `/writing/` is a small static blog.

Stack: Vite + TypeScript + three.js. The layout comes from an offline Python pipeline whose output is committed, so the
site build never needs Python.

## Run it

```sh
npm install
npm run dev          # http://localhost:5173
```

`npm run dev` doesn't serve `/writing/`, because those pages are generated at build time. To check posts locally:

```sh
npm run build && npx vite preview
```

Node 20.19 or newer is required (see `engines` in `package.json`).

## Edit content

All copy lives in `content/content.json`:

- `person`: name, tagline, email and links.
- `sections`: the five lobes plus `next`. Each section maps to a `region` (or `null`). Sections map to lobes as
  projects → frontal, work → parietal, research → temporal, worlds → occipital, craft → cerebellum.
- `items`: one entry per card. Each has `id` (unique, kebab-case), `section`, `title`, `dates` (may be `""`),
  `summary`, `body` (Markdown), `tags`, `links` (`{label, url}`) and `status`. Items in `next` need
  `status: "now"` or `"upcoming"`; every other item uses `status: null`.
- `clusterLabelOverrides`: replaces an auto-generated cluster label. It is keyed by the cluster's anchor item id
  (the item nearest the cluster centre). For a two-item cluster, key both ids.

Markdown in `body` supports links and images, but only with http, https or mailto URLs. Raw HTML is shown as text.

`npm run build` checks the content first (`scripts/check-sync.ts`), and fails with a message if:

- a field is missing or has the wrong type, an id is duplicated, or a `status` is wrong;
- the items in a section don't match the nodes in `content/layout.json`;
- a section's `tour` isn't exactly its node ids, or a node points at an unknown cluster or edge id.

### Re-run the layout pipeline after adding or removing items

The 3D positions, clusters, edges and tour come from `pipeline/build_layout.py` (embeddings → UMAP → e-means
clusters → kNN edges → tour). Re-run it whenever you add, remove or rename an item. Re-running it after a big
rewrite of an item's text is optional, but it keeps positions in step with the copy.

One-time setup (Python 3.12):

```sh
python3.12 -m venv pipeline/.venv
pipeline/.venv/bin/pip install -r pipeline/requirements.txt
```

Then:

```sh
pipeline/.venv/bin/python pipeline/build_layout.py   # rewrites content/layout.json and prints the clusters
git add content/layout.json content/content.json && git commit
```

Commit `layout.json`, because the site build reads it as is.

### Per-lobe item limits

Each lobe's circuit board routes one trace per item. The board first tries the default grid. If that is too
crowded, it retries on tighter grids (the decor parts are dropped). If even the tightest grid can't fit every
item, it draws as many traces as fit. The lobe still counts as wired from your visits, so the easter egg always
works. The measured limits for the current outlines:

| Lobe (section) | Default look up to | Full routing (tighter grid) up to | Items now |
|---|---|---|---|
| frontal (projects) | 20 | 26 | 12 |
| parietal (work) | 12 | 25 | 6 |
| temporal (research) | 5 | 25 | 3 |
| occipital (worlds) | 4 | 26 | 3 |
| cerebellum (craft) | 4 | 27 | 4 |

Past the "default look" column, the board looks denser. The e2e test `pcb.spec.ts › capacity` checks that every
lobe still routes its current count + 2.

## Write a post

Add `content/writing/<kebab-slug>.md`. The filename becomes the URL (`/writing/<kebab-slug>/`), so it must be
lowercase letters, digits and hyphens.

```md
---
title: "My post"
date: 2026-11-20
summary: "One line for the index, RSS and link previews."
draft: false
---

Markdown body…
```

`title`, `date` (YYYY-MM-DD) and `summary` are required. A post with `draft: true` is skipped. `npm run build`
writes the posts, the `/writing/` index and `/writing/rss.xml` into `dist/`.

## Writing from Obsidian

Any note in `~/life/writing/blog/` is published; `~/life/writing/` itself stays private. Drop a note there, then run

```sh
npm run publish-notes -- --push     # or just ask Claude
```

Vercel deploys the pushed commit. Moving the note out of `blog/` unpublishes it on the next run. Front matter is
optional: the title is the filename, the date is the day it was first published (kept in
`content/writing/.manifest.json`), and the summary is the first paragraph; `title`, `date`, `summary` in the note
override these, and `draft: true` keeps it out. `[[wikilinks]]` link to other published notes (otherwise they
become plain text), `![[image.png]]` is copied to `public/writing/media/<slug>/`, and `%% comments %%` are
stripped. Without `--push` the script only updates the files locally. `BLOG_SRC` overrides the folder. The files
under `content/writing/` that it writes are generated; edit the note, not them.

## Tests

```sh
npm test                                   # unit tests (vitest)
npm run e2e                                # Playwright, desktop + a no-WebGL project; starts Vite on :5173
npx tsc --noEmit                           # type check
pipeline/.venv/bin/pytest pipeline/tests -q   # pipeline tests
```

## Deploy

The site deploys on Vercel. `vercel.json` sets the build command (`npm run build`), the output directory (`dist`)
and clean URLs, with no framework preset, so Vercel doesn't try the old Jekyll build. Pushing a branch creates a
preview deployment. The production branch is set in the Vercel dashboard.

## Credits

Head silhouette "Profile Silhouette 02" by Mcbdixon, Wikimedia Commons, CC0 (https://commons.wikimedia.org/wiki/File:Profile_Silhouette_02.svg).
