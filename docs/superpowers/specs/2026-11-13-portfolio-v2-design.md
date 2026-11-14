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

### 3. The section map (Obsidian-style 3D graph — updated 11/13 per Yusuf)
- Looks and behaves like Obsidian's graph view, in 3D: small round nodes, thin straight edges, and each
  node's title as a text label beside it (labels fade with distance and when zoomed out).
- Nodes are placed by **semantic embedding**, so similar work sits close together. **Edges** link each node to
  its 2 most similar neighbors (cosine similarity of embeddings, union, deduplicated), so related work is
  visibly connected even in small sections.
- Light physics like Obsidian: a small force simulation with springs pulling each node toward its embedding
  position and along its edges, plus mild repulsion. Nodes drift gently, settle, and can be dragged; neighbors
  follow and spring back. Reduced motion: no drift, simulation settles instantly.
- Hovering a node highlights it, its neighbors and their edges, and dims everything else (Obsidian's focus
  behavior). Node size grows slightly with degree.
- **e-means** clusters color the nodes (Obsidian "groups"): each cluster gets a hue, with a faint glow at its
  centroid. **Hovering a cluster's glow shows its category label.** Sections with < 6 items have no clusters:
  nodes share one hue and hover shows just the item name.
- Drag empty space to rotate, scroll to zoom. Unvisited nodes are dim; visited nodes are bright.

### 4. Reading a node (node expands into a text box — updated 11/13 per Yusuf)
- Clicking a node makes **the node itself expand into a text box**: the camera eases to center the node, and a
  card grows out of the node's on-screen position (starting as a circle the node's size and color, morphing
  into a rounded card over ~350 ms). The card shows title, dates, summary, body, tags and links, and stays
  anchored to the node (the rest of the graph stays visible and dimmed behind it).
- **← / →** collapse the card back into its node, the camera moves along the section's nearest-neighbor tour,
  and the next node expands. Swipe on touch.
- **Back** (button, Esc, or browser back) collapses the card into its node, then leaves the section.
- Opening a node marks it visited. Narrow screens (≤ 600 px): the card grows from the node and then settles
  as a bottom sheet. Reduced motion: a quick fade instead of the morph.

### 5. Completion → PCB
- When every node in a section is visited, the section is complete. On returning to the profile, that region
  "solidifies": its outline fills with copper circuit traces, pads and vias (green solder mask, copper
  gold) that draw themselves in.
- Traces end at the region's edge in pads that line up with neighboring regions.

### 6. Easter egg — the circuit closes
When all five regions are complete, the pads connect across region borders, current visibly flows through the
whole head, and the profile "boots": the traces pulse in a spike pattern. Then new glowing traces route
themselves out of the head and across the black background, drawing in one by one. Each trace ends in a
terminal pad. Clicking a pad opens a short card about **what he's working on now or what's coming up** (one card
per trace). These items live in `content.json` under a `next` section (`now` / `upcoming` status), and he writes
the wording. A "rewire" button resets progress.

### 7. Writing (blog)
- A place for his thoughts instead of Medium. Posts are Markdown files in `content/writing/<slug>.md` with
  front matter (`title, date, summary, tags`). They build to plain, fast reading pages at `/writing/<slug>`, with
  an index at `/writing` and an RSS feed at `/writing/rss.xml`. No 3D on these pages; typography and reading
  comfort come first.
- Entrance: a small, quiet "Writing" mark near the profile's mouth (speech). Posts do **not** count toward
  wiring the circuit.
- Publishing = add a Markdown file and push.

### 8. Escape hatches
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
  4. Compute edges: each node to its 2 nearest neighbors by cosine similarity (undirected, deduplicated).
  5. Label each cluster from its top distinctive terms (c-TF-IDF), with hand overrides allowed in `content.json`.
  6. Compute each section's nearest-neighbor tour order.
  7. Write `content/layout.json` (committed, so the site build never needs Python).
- The head profile is the CC0 (public domain) silhouette "Profile Silhouette 02" from Wikimedia Commons (by
  Mcbdixon), stored at `assets-src/head-profile-cc0.svg`. Region paths are drawn by us inside its cranium.
  (Changed 11/13 per Yusuf: use an online SVG.)

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
5. Writing section (Markdown → pages + RSS).
6. `#list`, mobile, accessibility, performance pass.
7. Preview deploy → his review → merge and point production at `v2` (only with his OK).

## Out of scope

CMS, comments, analytics, contact form backend (contact is links + copyable email).

## Dependencies to install (will ask before each)

npm: vite, typescript, three, playwright. Python: faiss-cpu ≥ 1.16, sentence-transformers, umap-learn, scikit-learn.
