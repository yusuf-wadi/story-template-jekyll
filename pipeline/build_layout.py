"""Place content items in 3D by semantic similarity and cluster them.

Usage: python pipeline/build_layout.py  ->  writes content/layout.json
"""
import json
import os
import random
from pathlib import Path

# torch + faiss + numba each ship an OpenMP runtime; on macOS the combination
# segfaults unless threading is pinned. Must be set before they are imported.
os.environ.setdefault("OMP_NUM_THREADS", "1")

import numpy as np  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
MODEL = "BAAI/bge-small-en-v1.5"
TARGET_NORM = 8.0
EXCLUDED = {"next"}
_model = None


def item_text(item):
    return f"{item['title']}\n{item['summary']}\n{item['body']}"


def embed(texts):
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer(MODEL)
    return np.asarray(_model.encode(list(texts), normalize_embeddings=True), dtype="float32")


def _unit(emb):
    emb = np.asarray(emb, dtype="float32")
    return emb / np.maximum(np.linalg.norm(emb, axis=1, keepdims=True), 1e-12)


def cluster(emb, k, seed):
    """Cluster L2-normalized embeddings with Faiss e-means (spherical, CPU/NumPy).

    Tiny inputs: one full-batch step per epoch (batch_size=n), a few epochs.
    """
    from faiss.contrib.e_means import NumpyEmeans

    x = _unit(emb)
    n, d = x.shape
    em = NumpyEmeans(d, k, nepochs=10, batch_size=n, seed=seed, spherical=True)
    em.train(x)
    _, labels = em.assign(x)  # exact nearest-centroid labels
    return np.asarray(labels).reshape(-1).astype(int)


def choose_k(emb, seed):
    from sklearn.metrics import silhouette_score

    n = len(emb)
    if n < 6:
        return None
    x = _unit(emb)
    best_k, best = None, -2.0
    for k in range(2, min(6, n // 2) + 1):
        labels = cluster(x, k, seed)
        if len(set(labels)) < 2:
            continue
        s = silhouette_score(x, labels, metric="cosine")
        if s > best + 1e-9:
            best_k, best = k, s
    return best_k


def reduce_3d(emb, seed):
    n = len(emb)
    if n < 6:
        from sklearn.decomposition import PCA
        nc = min(3, n, emb.shape[1])
        out = PCA(n_components=nc, random_state=seed).fit_transform(emb) if n > 1 else np.zeros((n, 1))
        return np.pad(out, ((0, 0), (0, 3 - out.shape[1])))
    import umap
    return umap.UMAP(n_components=3, n_neighbors=min(5, n - 1), metric="cosine",
                     random_state=seed, init="random").fit_transform(emb)


def _normalize(pos):
    pos = pos - pos.mean(axis=0)
    m = np.linalg.norm(pos, axis=1).max()
    return pos * (TARGET_NORM / m) if m > 1e-9 else pos


def label_clusters(texts, labels):
    from sklearn.feature_extraction.text import CountVectorizer

    labels = np.asarray(labels)
    cids = sorted(set(labels.tolist()))
    docs = [" ".join(t for t, l in zip(texts, labels) if l == c) for c in cids]
    cv = CountVectorizer(stop_words="english", token_pattern=r"(?u)\b[a-zA-Z][a-zA-Z]+\b")
    tf = cv.fit_transform(docs).toarray().astype(float)
    tf = tf / np.maximum(tf.sum(axis=1, keepdims=True), 1)
    total = tf.sum(axis=0)
    avg = max(tf.sum() / len(cids), 1e-9)
    ctfidf = tf * np.log(1 + avg / np.maximum(total, 1e-9))
    terms = cv.get_feature_names_out()
    out = {}
    for row, c in zip(ctfidf, cids):
        top = sorted(range(len(terms)), key=lambda i: (-row[i], terms[i]))[:2]
        out[c] = " · ".join(terms[i] for i in top)
    return out


def nn_tour(pos, ids):
    pos = np.asarray(pos, dtype=float)
    cen = pos.mean(axis=0)
    cur = int(np.argmin(np.linalg.norm(pos - cen, axis=1)))
    left = set(range(len(ids))) - {cur}
    tour = [cur]
    while left:
        cur = min(sorted(left), key=lambda j: np.linalg.norm(pos[j] - pos[cur]))
        left.remove(cur)
        tour.append(cur)
    return [ids[i] for i in tour]


def knn_edges(emb, ids, k=2):
    """Each node's k most cosine-similar others, as an undirected, deduplicated, sorted edge list."""
    n = len(ids)
    if n < 2:
        return []
    x = _unit(emb)
    sim = x @ x.T
    np.fill_diagonal(sim, -np.inf)
    out = set()
    for i in range(n):
        for j in np.argsort(-sim[i], kind="stable")[:min(k, n - 1)]:
            a, b = sorted((ids[i], ids[int(j)]))
            out.add((a, b))
    return sorted(out)


def _r3(a):
    return [round(float(v), 3) for v in a]


def build(content, seed=7):
    random.seed(seed)
    np.random.seed(seed)
    overrides = content.get("clusterLabelOverrides", {})
    sections = {}
    order = []
    for it in content["items"]:
        if it["section"] not in EXCLUDED and it["section"] not in order:
            order.append(it["section"])
    for sec in order:
        items = [i for i in content["items"] if i["section"] == sec]
        ids = [i["id"] for i in items]
        texts = [item_text(i) for i in items]
        emb = _unit(embed(texts))
        pos = _normalize(reduce_3d(emb, seed))
        k = choose_k(emb, seed)
        forced = content.get("clusterCount", {}).get(sec)
        if forced is not None and len(items) >= 6:
            if not isinstance(forced, int) or forced < 2 or forced > len(items) // 2:
                raise ValueError(f"clusterCount[{sec!r}]={forced!r}: need an integer in 2..{len(items) // 2}")
            k = forced
        node_cluster = [None] * len(items)
        clusters = []
        if k is not None:
            raw = cluster(emb, k, seed)
            remap = {}
            for l in raw:  # relabel by first appearance for stable ids
                remap.setdefault(int(l), len(remap))
            lab = np.array([remap[int(l)] for l in raw])
            names = label_clusters(texts, lab)
            for c in range(len(remap)):
                idx = np.where(lab == c)[0]
                cen = pos[idx].mean(axis=0)
                dist = np.linalg.norm(pos[idx] - cen, axis=1)
                anchor = ids[idx[int(np.argmin(dist))]]
                clusters.append({
                    "id": c,
                    "label": overrides.get(anchor, names[c]),
                    "centroid": _r3(cen),
                    "radius": round(float(dist.max()) + 0.5, 3),
                })
            node_cluster = [int(l) for l in lab]
        sections[sec] = {
            "nodes": [{"id": i, "pos": _r3(p), "cluster": c}
                      for i, p, c in zip(ids, pos, node_cluster)],
            "clusters": clusters,
            "tour": nn_tour(np.round(pos, 3), ids),
            "edges": [list(e) for e in knn_edges(emb, ids)],
        }
    return {"sections": sections}


def main():
    content = json.loads((ROOT / "content" / "content.json").read_text())
    layout = build(content, 7)
    (ROOT / "content" / "layout.json").write_text(json.dumps(layout, indent=2) + "\n")
    for sec, s in layout["sections"].items():
        for c in s["clusters"]:
            members = [n["id"] for n in s["nodes"] if n["cluster"] == c["id"]]
            print(f"{sec} [{c['id']}] {c['label']}: {', '.join(members)}")


if __name__ == "__main__":
    main()
