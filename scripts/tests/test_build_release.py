"""Tests for scripts/releases/build_release.py (the "What's new" entry drafter).

    python3 -m unittest discover -s scripts/tests
"""

import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "releases"))

import build_release  # noqa: E402
from build_release import build_entry, default_title, diff_release, insert_entry, names_list  # noqa: E402


def model(id_, name, quant="Q4_K_M", **kw):
    row = {"id": id_, "name": name, "quantization": quant, "params_b": 8, "weight_gb": 4.9,
           "kv_per_1k_gb": 0.122, "max_context_k": 128, "layers": 32, "features": ["tool_use"],
           "mmlu_score": None, "swe_bench_score": None}
    row.update(kw)
    return row


def gpu(id_, name, **kw):
    row = {"id": id_, "name": name, "manufacturer": "NVIDIA", "vram_gb": 16, "bandwidth_gbps": 448}
    row.update(kw)
    return row


class DiffReleaseTest(unittest.TestCase):
    def test_new_models_by_name_once_and_new_gpus_by_id(self):
        old = [model("a-q4", "A")]
        new = [model("a-q4", "A"), model("b-q8", "B", "Q8_0"), model("b-q4", "B")]
        diff = diff_release(old, new, [gpu("g1", "G1")], [gpu("g2", "G2"), gpu("g1", "G1")])
        self.assertEqual(diff["models_added"], ["B"])
        self.assertEqual(diff["gpus_added"], ["g2"])
        self.assertEqual(diff["corrections"], [])

    def test_new_quantization_of_an_existing_model_is_not_a_new_model(self):
        diff = diff_release([model("a-q4", "A")], [model("a-q4", "A"), model("a-q8", "A", "Q8_0")], [], [])
        self.assertEqual(diff["models_added"], [])
        self.assertEqual(diff["corrections"], ["A: added Q8_0"])

    def test_same_change_on_every_quantization_is_said_once(self):
        old = [model("a-q4", "A"), model("a-q8", "A", "Q8_0")]
        new = [model("a-q4", "A", mmlu_score=70.1), model("a-q8", "A", "Q8_0", mmlu_score=70.1)]
        diff = diff_release(old, new, [], [])
        self.assertEqual(diff["corrections"], ["A: MMLU-Pro (mmlu_score) none → 70.1"])

    def test_different_changes_per_quantization_are_listed_per_row(self):
        old = [model("a-q4", "A", weight_gb=4.9), model("a-q8", "A", "Q8_0", weight_gb=8.5)]
        new = [model("a-q4", "A", weight_gb=4.6), model("a-q8", "A", "Q8_0", weight_gb=7.9)]
        diff = diff_release(old, new, [], [])
        self.assertEqual(diff["corrections"], ["A: file size (weight_gb) a-q4 4.9 → 4.6; a-q8 8.5 → 7.9"])

    def test_many_models_collapse_into_one_count_line(self):
        names = ["A", "B", "C", "D", "E"]
        old = [model(f"{n.lower()}-q4", n) for n in names]
        new = [model(f"{n.lower()}-q4", n, active_weight_gb=1.0) for n in names]
        diff = diff_release(old, new, [], [])
        self.assertEqual(diff["corrections"],
                         ["active weights (active_weight_gb) added for 5 models (5 rows): A, B, C and 2 more"])

    def test_gpu_spec_changes_and_removals(self):
        diff = diff_release([model("a-q4", "A")], [], [gpu("g1", "G1"), gpu("g2", "G2")],
                            [gpu("g1", "G1", bandwidth_gbps=504)])
        self.assertIn("G1: bandwidth (bandwidth_gbps) 448 → 504", diff["corrections"])
        self.assertIn("Removed or renamed: A", diff["corrections"])
        self.assertIn("Removed or renamed GPUs: g2", diff["corrections"])

    def test_memory_options_are_shown_as_sizes(self):
        old = [gpu("m", "M", vram_gb=None, vram_options=[{"vram_gb": 24, "bandwidth_gbps": 273}])]
        new = [gpu("m", "M", vram_gb=None, vram_options=[{"vram_gb": 24, "bandwidth_gbps": 273},
                                                          {"vram_gb": 64, "bandwidth_gbps": 273}])]
        diff = diff_release([], [], old, new)
        self.assertEqual(diff["corrections"], ["M: memory options (vram_options) 24 GB → 24/64 GB"])


class EntryTest(unittest.TestCase):
    def test_default_title(self):
        self.assertEqual(default_title(["A", "B"], ["g"]), "2 new models and 1 new GPU")
        self.assertEqual(default_title(["A"], []), "1 new model")
        self.assertEqual(default_title([], []), "Data corrections")

    def test_names_list(self):
        self.assertEqual(names_list(["A"]), "A")
        self.assertEqual(names_list(["A", "B"]), "A and B")
        self.assertEqual(names_list(["A", "B", "C", "D"]), "A, B, C and 1 more")

    def test_build_entry_has_the_releases_json_keys_and_checks_the_date(self):
        entry = build_entry("2026-11-27", {"models_added": ["A"], "gpus_added": [], "corrections": []})
        self.assertEqual(sorted(entry), ["corrections", "date", "gpus_added", "models_added", "summary", "title"])
        # The placeholder fails data.test.js until a human writes the summary
        self.assertIn("TODO", entry["summary"])
        with self.assertRaises(ValueError):
            build_entry("27/11/2026", {"models_added": [], "gpus_added": [], "corrections": []})

    def test_insert_entry_keeps_newest_first_and_refuses_duplicates(self):
        releases = [{"date": "2026-11-13"}, {"date": "2026-09-07"}]
        out = insert_entry(releases, {"date": "2026-10-24"})
        self.assertEqual([r["date"] for r in out], ["2026-11-13", "2026-10-24", "2026-09-07"])
        with self.assertRaises(ValueError):
            insert_entry(releases, {"date": "2026-11-13"})
        replaced = insert_entry(releases, {"date": "2026-11-13", "title": "new"}, replace=True)
        self.assertEqual(replaced[0], {"date": "2026-11-13", "title": "new"})
        self.assertEqual(len(replaced), 2)


class MainTest(unittest.TestCase):
    def test_append_writes_releases_json_from_two_snapshots(self):
        snapshots = {
            ("old", build_release.MODELS_PATH): [model("a-q4", "A")],
            ("new", build_release.MODELS_PATH): [model("a-q4", "A"), model("b-q4", "B")],
            ("old", build_release.GPUS_PATH): [],
            ("new", build_release.GPUS_PATH): [gpu("g1", "G1")],
        }
        original = build_release.read_json_at
        build_release.read_json_at = lambda ref, path: snapshots[(ref, path)]
        try:
            with tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "releases.json"
                path.write_text(json.dumps([{"date": "2026-11-13"}]))
                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                    code = build_release.main(["--from", "old", "--to", "new", "--date", "2026-11-27",
                                               "--title", "B arrives", "--append", "--releases", str(path)])
                self.assertEqual(code, 0)
                written = json.loads(path.read_text())
        finally:
            build_release.read_json_at = original
        self.assertEqual([r["date"] for r in written], ["2026-11-27", "2026-11-13"])
        self.assertEqual(written[0]["title"], "B arrives")
        self.assertEqual(written[0]["models_added"], ["B"])
        self.assertEqual(written[0]["gpus_added"], ["g1"])


if __name__ == "__main__":
    unittest.main()
