# Portfolio v2 — "Circuit Mind" design

Date: 2026-11-13 · Branch: `v2` (off `wadi_site`, which is what ywadi-portfol.vercel.app deploys today)

## Intent

A portfolio that shows who Yusuf is and what he's about: an engineer and artist fascinated by computational
neuroscience and fractal geometry. It should feel like art first and be fun to explore, while every fact on it is
accurate. Success = a visitor explores voluntarily, understands his work, and remembers the site.

**From Yusuf:** the side-profile → section → embedded node map → read → completion → PCB → easter egg loop below;
e-means clustering; three.js; scroll/transition polish; comp-neuro + fractal emphasis; artist at heart.
**Assumed (approved 11/13):** build-time embedding, progress saved per browser, a plain-list escape hatch.
**Decided by Claude (he said "up to you"):** which section lives in which brain region; the easter egg.

## Experience

### 1. The profile (home)
- Black background. A low-opacity, hand-drawn-style side profile of a head, facing left, with the brain inside
  divided into five regions. His name and one line ("Engineer. Artist. Curious about how minds compute.") sit beside it.
- Hovering a region brightens it and shows its name. Clicking it starts the dive.
- A small progress readout (e.g. `2 / 5 regions wired`) and a "plain list" link in the corner.

| Region | Section | Why it fits | Approx. items |
|---|---|---|---|
| Frontal lobe | **Projects** (things he built) | planning and making | ~14 |
| Parietal lobe | **Work** (roles and shipped systems) | integration, doing | ~7 |
| Temporal lobe | **Research** | memory, learning | ~4 |
| Occipital lobe | **Worlds** (games, graphics, visual art) | vision | ~5 |
| Cerebellum | **Craft** (skills, competitions, education) | practiced skill | ~5 |

Exact item lists come from the content review (step 1 of the build), not from this spec.

### 2. The dive (transition)
The camera pushes into the clicked region. The region's 2D outline dissolves into particles that become the
nodes of that section's 3D map. About 1.2 s, eased. Reduced-motion users get a fade.

### 3. The section map
- A 3D scene of nodes, one per item, placed by **semantic embedding** of the item's text, so similar work sits
  close together.
- Nodes are grouped by **e-means** (Meta FAIR, Faiss 1.16, Nov 2026) into soft-edged regions (translucent hulls
  or glow fields). **Hovering a region shows its category label.** If a section has too few items to cluster
  meaningfully (< 6), there are no regions and hovering shows just the item name.
- Slow orbit drift, drag to rotate, scroll to zoom.
- Unvisited nodes are dim. Visited nodes glow.

### 4. Reading a node
- Clicking a node flies the camera to it and opens a reading panel: title, dates, a short summary, the body,
  tags, links (GitHub, demo, paper).
- **← / →** move to the previous / next node along a precomputed nearest-neighbor tour of the section (so
  "next" is always the closest unseen-in-order neighbor). Swipe on touch.
- **Back** (button, Esc, or browser back) closes the panel, then leaves the section.
- Opening a node marks it visited.

### 5. Completion → PCB
- When every node in a section is visited, the section is complete. On returning to the profile, that region
  "solidifies": its outline fills with copper circuit traces, pads and vias (green solder mask, copper
  gold) that draw themselves in.
- Traces end at the region's edge in pads that line up with neighboring regions.

### 6. Easter egg — the circuit closes
When all five regions are complete, the pads connect across region borders, current visibly flows through the
whole head, and the profile "boots": the traces pulse in a spike pattern, and a single neuron grows out of the
brainstem as a fractal dendrite (the Dendrite prototype from the direction board). Clicking its soma unlocks a
hidden sixth node: a personal note from Yusuf plus a teaser for whatever he's researching now (wording is his).
A "rewire" button resets progress.

### 7. Escape hatches
- `#list` route: a fast, accessible plain list of everything (sections → items), linkable, readable by recruiters
  and screen readers. Also the fallback when WebGL is unavailable.
- Mobile: same flow, with tap and swipe; the 3D map uses fewer effects.

## Content

- One source file: `content/content.json`, holding `sections[]` and `items[]`
  (`id, section, title, dates, summary, body, tags[], links[]`).
- Written from his canonical career profile, using ✅/📄 facts only. Toyota uses only the public-safe bullets.
  Fixes the old site's errors (Monoware = Summers 2022 & 2023; Scale AI described accurately).
- He reviews the content on a readable page before any design work depends on it.

## Architecture

- **Site:** Vite + TypeScript + three.js, static output, deployed on the same Vercel project. No backend.
  - `profile/`: the SVG head and regions, hover, PCB fill animation (SVG stroke drawing).
  - `map/`: the three.js section scene, cluster hulls, node picking, camera flights.
  - `reader/`: the panel and ←/→/back navigation.
  - `progress/`: visited set in `localStorage` (try/catch; works without it), completion events.
  - `router`: hash routes `#projects`, `#projects/tinygrad-ngp`, `#list`, so browser back works.
- **Build-time layout pipeline** (Python, `pipeline/build_layout.py`), run when content changes:
  1. Embed each item's title + summary + body with a local sentence-embedding model (bge-small).
  2. Per section, cluster with e-means (`faiss.contrib.e_means`), with k picked by silhouette score; skip if < 6 items.
  3. Reduce to 3D (UMAP, PCA fallback) and normalize into the scene volume.
  4. Label each cluster from its top distinctive terms (c-TF-IDF), with hand overrides allowed in `content.json`.
  5. Compute each section's nearest-neighbor tour order.
  6. Write `content/layout.json` (committed, so the site build never needs Python).
- The SVG head profile is drawn originally for this site (no traced or stock artwork).

## Testing

- Pipeline: unit tests for schema validation, tour order (visits every node exactly once), deterministic output
  with a fixed seed, and the small-section (no clusters) case.
- Site: Playwright smoke tests: profile renders, region click enters the section, node open marks visited, ←/→
  order matches the tour, completing a section shows the PCB, `#list` renders with WebGL disabled.
- Manual: Yusuf clicks through a Vercel preview of the `v2` branch on desktop and phone.

## Build order

1. Content: `content.json` + review page → his corrections.
2. Rough prototype of the full loop with placeholder visuals (profile → section → node → back → completion).
3. Layout pipeline with e-means → real maps.
4. Visual polish: head art, dive transition, PCB animation, easter egg.
5. `#list`, mobile, accessibility, performance pass.
6. Preview deploy → his review → merge and point production at `v2` (only with his OK).

## Out of scope

Blog/writing section, CMS, analytics, contact form backend (contact is links + copyable email).

## Dependencies to install (will ask before each)

npm: vite, typescript, three, playwright. Python: faiss-cpu ≥ 1.16, sentence-transformers, umap-learn, scikit-learn.
