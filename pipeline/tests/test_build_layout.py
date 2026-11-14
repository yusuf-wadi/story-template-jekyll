import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build_layout as bl  # noqa: E402

D = 16


def blob_emb(center, i, rng):
    v = np.zeros(D)
    v[center] = 1.0
    return v + rng.normal(0, 0.03, D)


def make_content():
    rng = np.random.default_rng(0)
    items, embs = [], {}
    for sec, n_items in (("projects", 12), ("work", 4)):
        for i in range(n_items):
            blob = i % 2
            iid = f"{sec}-{i}"
            word = "alpha" if blob == 0 else "beta"
            items.append({
                "id": iid, "section": sec, "title": f"{iid} {word}",
                "dates": "", "summary": f"{word} {word} thing", "body": f"{word} body",
                "tags": [], "links": [], "status": None,
            })
            embs[f"{iid} {word}"] = blob_emb(blob if sec == "projects" else blob + 4, i, rng)
    items.append({"id": "nx", "section": "next", "title": "nx", "dates": "",
                  "summary": "s", "body": "b", "tags": [], "links": [], "status": None})
    embs["nx"] = np.ones(D)
    content = {"person": {}, "sections": [], "items": items, "clusterLabelOverrides": {}}
    return content, embs


@pytest.fixture
def content(monkeypatch):
    c, embs = make_content()

    def fake_embed(texts):
        # texts begin with the title
        out = []
        for t in texts:
            key = next(k for k in embs if t.startswith(k))
            out.append(embs[key])
        return np.array(out, dtype="float32")

    monkeypatch.setattr(bl, "embed", fake_embed)
    return c


def proj_emb(content):
    items = [i for i in content["items"] if i["section"] == "projects"]
    return items, bl.embed([bl.item_text(i) for i in items])


def test_tour_visits_each_node_once():
    pos = np.random.default_rng(1).normal(size=(9, 3))
    ids = [f"n{i}" for i in range(9)]
    assert sorted(bl.nn_tour(pos, ids)) == sorted(ids)


def test_small_section_has_no_clusters(content):
    sec = bl.build(content, 7)["sections"]["work"]
    assert sec["clusters"] == []
    assert all(n["cluster"] is None for n in sec["nodes"])


def test_two_obvious_blobs_get_two_clusters(content):
    items, emb = proj_emb(content)
    assert bl.choose_k(emb, 7) == 2
    sec = bl.build(content, 7)["sections"]["projects"]
    groups = {}
    for n in sec["nodes"]:
        groups.setdefault(n["cluster"], set()).add(int(n["id"].split("-")[1]) % 2)
    assert len(groups) == 2 and all(len(g) == 1 for g in groups.values())


def test_deterministic(content):
    assert bl.build(content, 7) == bl.build(content, 7)


def test_positions_within_radius(content):
    for sec in bl.build(content, 7)["sections"].values():
        for n in sec["nodes"]:
            assert np.linalg.norm(n["pos"]) <= 10


def test_override_label(content):
    base = bl.build(content, 7)["sections"]["projects"]
    pos = {n["id"]: np.array(n["pos"]) for n in base["nodes"]}
    cl = base["clusters"][0]
    members = [i for i, p in pos.items()
               if next(n for n in base["nodes"] if n["id"] == i)["cluster"] == cl["id"]]
    anchor = min(members, key=lambda i: np.linalg.norm(pos[i] - np.array(cl["centroid"])))
    content["clusterLabelOverrides"] = {anchor: "Custom Label"}
    out = bl.build(content, 7)["sections"]["projects"]
    assert next(c for c in out["clusters"] if c["id"] == cl["id"])["label"] == "Custom Label"


def test_cluster_count_override(content):
    content["clusterCount"] = {"projects": 3}
    a = bl.build(content, 7)["sections"]["projects"]
    assert len(a["clusters"]) == 3
    assert a == bl.build(content, 7)["sections"]["projects"]
    content["clusterCount"] = {"projects": 99}
    with pytest.raises(ValueError):
        bl.build(content, 7)


def test_next_excluded(content):
    assert "next" not in bl.build(content, 7)["sections"]


def test_knn_edges_dedup_sorted():
    emb = np.array([[1.0, 0, 0], [0.9, 0.1, 0], [0, 0.3, 1.0]])
    ids = ["z", "m", "a"]
    # k=1: z<->m mutual, a's nearest is m
    assert bl.knn_edges(emb, ids, k=1) == [("a", "m"), ("m", "z")]
    assert bl.knn_edges(emb, ids) == [("a", "m"), ("a", "z"), ("m", "z")]


def test_edges_present_all_sections(content):
    out = bl.build(content, 7)["sections"]
    for sec in out.values():
        ids = {n["id"] for n in sec["nodes"]}
        assert sec["edges"], "every multi-node section has edges"
        for a, b in sec["edges"]:
            assert a < b and a in ids and b in ids
        assert sec["edges"] == sorted(sec["edges"])
        deg = {i: 0 for i in ids}
        for a, b in sec["edges"]:
            deg[a] += 1
            deg[b] += 1
        assert min(deg.values()) >= 2


def test_single_node_no_edges(content):
    content["items"].append({"id": "solo", "section": "craft", "title": "nx", "dates": "",
                             "summary": "s", "body": "b", "tags": [], "links": [], "status": None})
    assert bl.build(content, 7)["sections"]["craft"]["edges"] == []
