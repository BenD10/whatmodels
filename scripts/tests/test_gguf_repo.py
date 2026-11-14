"""Tests for gguf_repo / gguf_shards: validation, llama.cpp tag resolution and
the backfill's repo matching. Run from the repo root:

    python3 -m unittest discover -s scripts/tests
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "models"))

from backfill_gguf_repo import (  # noqa: E402
    check_weights,
    classify_weight,
    fixed_weights,
    name_matches,
    row_file_size,
    size_match,
    with_repo,
)
from model_script_utils import (  # noqa: E402
    RUN_TAGS,
    gguf_families,
    llamacpp_resolve,
    validate_model_entry,
)

ENTRY = {
    "id": "qwen3.5-27b-q4", "name": "Qwen3.5 27B", "params_b": 27.78, "quantization": "Q4_K_M",
    "weight_gb": 15.59, "gguf_repo": "unsloth/Qwen3.5-27B-GGUF", "gguf_shards": 1,
    "kv_per_1k_gb": 0.061, "max_context_k": 256, "layers": 64, "mmlu_score": None,
    "swe_bench_score": None, "features": ["vision"], "notes": "n",
}


def errors_for(**over):
    return validate_model_entry({**ENTRY, **over})


class ValidateGgufRepoTest(unittest.TestCase):
    def test_valid_repo(self):
        self.assertEqual(errors_for(), [])

    def test_null_repo_with_null_shards(self):
        self.assertEqual(errors_for(gguf_repo=None, gguf_shards=None), [])

    def test_rejects_malformed_repos(self):
        for bad in ["unsloth", "a/b/c", "unsloth/Foo GGUF", "/Foo", "x/y;rm", 42, ""]:
            with self.subTest(bad=bad):
                self.assertTrue(any("gguf_repo" in e for e in errors_for(gguf_repo=bad)))

    def test_shards_must_follow_repo(self):
        self.assertTrue(errors_for(gguf_repo=None, gguf_shards=1))
        for bad in [None, 0, True, 1.5]:
            with self.subTest(bad=bad):
                self.assertTrue(any("gguf_shards" in e for e in errors_for(gguf_shards=bad)))


class LlamaCppResolveTest(unittest.TestCase):
    """Mirrors find_best_model + get_split_files in llama.cpp common/download.cpp."""

    def test_single_file(self):
        paths = ["Model-Q4_K_M.gguf", "Model-Q8_0.gguf", "mmproj-F16.gguf"]
        self.assertEqual(llamacpp_resolve(paths, "Q4_K_M"), ["Model-Q4_K_M.gguf"])
        self.assertEqual(llamacpp_resolve(paths, "q8_0"), ["Model-Q8_0.gguf"])  # case-insensitive

    def test_sharded_set_is_downloaded_whole(self):
        paths = [
            "Q8_0/Model-Q8_0-00002-of-00003.gguf", "Q8_0/Model-Q8_0-00001-of-00003.gguf",
            "Q8_0/Model-Q8_0-00003-of-00003.gguf", "Q4_K_M/Model-Q4_K_M-00001-of-00002.gguf",
        ]
        self.assertEqual(llamacpp_resolve(paths, "Q8_0"), [
            "Q8_0/Model-Q8_0-00001-of-00003.gguf", "Q8_0/Model-Q8_0-00002-of-00003.gguf",
            "Q8_0/Model-Q8_0-00003-of-00003.gguf",
        ])

    def test_ud_quants_are_not_q4_k_m(self):
        # UD-Q4_K_XL never matches the Q4_K_M token
        self.assertEqual(llamacpp_resolve(["Model-UD-Q4_K_XL.gguf"], "Q4_K_M"), [])
        self.assertEqual(llamacpp_resolve(["Model-UD-Q4_K_XL.gguf"], "UD-Q4_K_XL"), ["Model-UD-Q4_K_XL.gguf"])

    def test_ud_file_with_same_token_loses_on_sort_order(self):
        # "Q4_K_M" matches UD-Q4_K_M as a token too; the plain file sorts first
        paths = ["Model-UD-Q4_K_M.gguf", "Model-Q4_K_M.gguf"]
        self.assertEqual(llamacpp_resolve(paths, "Q4_K_M"), ["Model-Q4_K_M.gguf"])

    def test_sidecars_are_skipped(self):
        paths = ["mmproj-Model-Q8_0.gguf", "mtp-Model-Q8_0.gguf", "dspark-Model-Q8_0.gguf", "Model.imatrix-Q8_0.gguf"]
        self.assertEqual(llamacpp_resolve(paths, "Q8_0"), [])

    def test_f16_does_not_match_bf16(self):
        self.assertEqual(llamacpp_resolve(["Model-BF16.gguf"], RUN_TAGS["fp16"]), [])
        self.assertEqual(llamacpp_resolve(["Model-F16.gguf"], RUN_TAGS["fp16"]), ["Model-F16.gguf"])


class GgufFamiliesTest(unittest.TestCase):
    def test_families_list_every_file_set(self):
        info = {"siblings": [
            {"rfilename": "Q4_K_M/Model-Q4_K_M-00001-of-00002.gguf", "size": 10},
            {"rfilename": "Q4_K_M/Model-Q4_K_M-00002-of-00002.gguf", "size": 5},
            {"rfilename": "Other-Q4_K_M.gguf", "size": 12},
            {"rfilename": "mmproj-F16.gguf", "size": 1},
        ]}
        families = gguf_families(info)
        self.assertEqual([(f["key"], f["size"], len(f["files"]), f["complete"]) for f in families], [
            ("/Other-Q4_K_M.gguf", 12, 1, True),
            ("Q4_K_M/Model-Q4_K_M", 15, 2, True),
        ])


class BackfillMatchingTest(unittest.TestCase):
    def test_name_matches(self):
        cases = [
            ("Qwen 2.5 7B", "bartowski/Qwen2.5-7B-Instruct-GGUF", True),
            ("Qwen 2.5 7B", "Qwen/Qwen2.5-Coder-7B-Instruct-GGUF", False),
            ("Qwen 2.5 7B", "bartowski/Qwen2.5-7B-Instruct-1M-GGUF", False),
            ("Llama 3.1 8B", "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF", True),
            ("Llama 3.1 8B", "bartowski/Aion-RP-Llama-3.1-8B-GGUF", False),
            ("Mistral Small 3.1 24B", "bartowski/mistralai_Mistral-Small-3.1-24B-Instruct-2503-GGUF", True),
            ("Llama 3.2 Vision 11B", "bartowski/Llama-3.2-11B-Vision-Instruct-GGUF", True),
            ("Gemma 2 9B", "bartowski/gemma-2-9b-it-GGUF", True),
        ]
        for name, repo, expected in cases:
            with self.subTest(name=name, repo=repo):
                self.assertEqual(name_matches(name, repo), expected)

    def test_size_match_accepts_gib_or_decimal_gb(self):
        # 15.59 GiB recorded, file 16.74e9 bytes = 15.59 GiB
        self.assertEqual(size_match(15.59, int(15.59 * 1024 ** 3), 0.02)[0], "GiB")
        # Older rows recorded decimal GB: 4.92 GB file
        self.assertEqual(size_match(4.92, 4_920_000_000, 0.02)[0], "GB")
        self.assertIsNone(size_match(4.92, 6_000_000_000, 0.02))

    def test_with_repo_places_fields_after_weight(self):
        row = {"id": "a", "weight_gb": 1.0, "kv_per_1k_gb": 0.1, "gguf_repo": "old/x", "gguf_shards": 2}
        self.assertEqual(list(with_repo(row, "o/r", 1)), ["id", "weight_gb", "gguf_repo", "gguf_shards", "kv_per_1k_gb"])
        self.assertEqual(with_repo(row, None, None)["gguf_repo"], None)


GIB = 1024 ** 3


class FakeHub:
    def __init__(self, repos):
        self.repos = repos

    def repo_info(self, repo):
        return self.repos.get(repo)


class WeightCheckTest(unittest.TestCase):
    """--check-weights / --fix-weights: weight_gb is GiB, never decimal GB."""

    def test_classify_gib_decimal_and_other(self):
        # deepseek-coder-6.7b Q4_K_M: 4,083,016,960 bytes = 3.80 GiB = 4.08 GB
        size = 4_083_016_960
        self.assertEqual(classify_weight(3.80, size), "GiB")
        self.assertEqual(classify_weight(4.08, size), "GB")
        # Mistral Nemo Q4 stored 7.6 for a 7.48 GB file: 1.6% off decimal, so a person decides
        self.assertEqual(classify_weight(7.6, 7_477_000_000), "other")

    def test_units_are_7_percent_apart_so_1_percent_never_overlaps(self):
        for gib in (0.75, 4.58, 69.83, 1012.92):
            size = int(gib * GIB)
            with self.subTest(gib=gib):
                self.assertEqual(classify_weight(gib, size), "GiB")
                self.assertEqual(classify_weight(round(size / 1e9, 2), size), "GB")

    def test_fixed_weights_dense(self):
        # 4.92 GB decimal -> 4.58 GiB
        self.assertEqual(fixed_weights({"weight_gb": 4.92, "params_b": 8.03}, 4_920_664_480), {"weight_gb": 4.58})

    def test_fixed_weights_recomputes_active_with_add_model_rule(self):
        # Qwen3-Coder 30B A3B Q4: 3B active of 30.5B; 18.6 GB -> 17.28 GiB
        # add_model: round(3 * 17.28 / 30.5, 2) = 1.70
        row = {"weight_gb": 18.6, "params_b": 30.5, "active_weight_gb": 1.83}
        self.assertEqual(fixed_weights(row, int(17.28 * GIB)), {"weight_gb": 17.28, "active_weight_gb": 1.7})
        # gpt-oss-20b Q4: 3.6B active of 21B; 11.67 -> 10.83 -> round(3.6 * 10.83 / 21, 2) = 1.86
        row = {"weight_gb": 11.67, "params_b": 21, "active_weight_gb": 2.0}
        self.assertEqual(fixed_weights(row, int(10.83 * GIB))["active_weight_gb"], 1.86)

    def test_fixed_weights_scales_active_when_params_cannot_be_recovered(self):
        # 0.5 active GB on 10 GB of 13B implies 0.65B active; 0.6B or 0.7B give 0.46 / 0.54, not 0.5,
        # so the old figure is scaled instead: 0.5 * 9 / 10 = 0.45
        row = {"weight_gb": 10.0, "params_b": 13, "active_weight_gb": 0.5}
        self.assertEqual(fixed_weights(row, int(9.0 * GIB))["active_weight_gb"], 0.45)

    def test_row_file_size_sums_the_run_command_file_set(self):
        info = {"siblings": [
            {"rfilename": "Q8_0/M-Q8_0-00001-of-00002.gguf", "size": 3 * GIB},
            {"rfilename": "Q8_0/M-Q8_0-00002-of-00002.gguf", "size": 2 * GIB},
            {"rfilename": "mmproj-F16.gguf", "size": GIB},
            {"rfilename": "M-UD-Q4_K_XL.gguf", "size": GIB},
        ]}
        size, files, problem = row_file_size(info, {"quantization": "Q8_0", "gguf_shards": 2})
        self.assertEqual((size, len(files), problem), (5 * GIB, 2, None))
        size, _files, problem = row_file_size(info, {"quantization": "Q8_0", "gguf_shards": 1})
        self.assertIsNone(size)
        self.assertIn("gguf_shards", problem)
        self.assertIn("no :Q4_K_M", row_file_size(info, {"quantization": "Q4_K_M", "gguf_shards": 1})[2])

    def test_check_weights_fixes_only_decimal_rows_unless_told(self):
        hub = FakeHub({"o/r": {"siblings": [
            {"rfilename": "M-Q4_K_M.gguf", "size": 4_920_664_480},  # 4.58 GiB / 4.92 GB
            {"rfilename": "M-Q8_0.gguf", "size": 8_540_770_784},    # 7.95 GiB / 8.54 GB
        ]}})
        rows = [
            {"id": "a-q4", "name": "A", "quantization": "Q4_K_M", "weight_gb": 4.92, "params_b": 8.03,
             "gguf_repo": "o/r", "gguf_shards": 1},
            {"id": "a-q8", "name": "A", "quantization": "Q8_0", "weight_gb": 8.7, "params_b": 8.03,
             "gguf_repo": "o/r", "gguf_shards": 1},
            {"id": "b-q4", "name": "B", "quantization": "Q4_K_M", "weight_gb": 4.58, "params_b": 8.03,
             "gguf_repo": "o/r", "gguf_shards": 1},
            {"id": "c-q4", "name": "C", "quantization": "Q4_K_M", "weight_gb": 4.0, "params_b": 8.03,
             "gguf_repo": None, "gguf_shards": None},
            {"id": "d-q4", "name": "D", "quantization": "Q4_K_M", "weight_gb": 4.0, "params_b": 8.03,
             "gguf_repo": "o/gone", "gguf_shards": 1},
        ]
        found = {f["row"]["id"]: (f["unit"], f["fields"]) for f in check_weights(hub, rows, [])}
        self.assertEqual(found, {
            "a-q4": ("GB", {"weight_gb": 4.58}),
            "a-q8": ("other", {}),
            "b-q4": ("GiB", {}),
            "d-q4": ("error", {}),
        })
        found = {f["row"]["id"]: f["fields"] for f in check_weights(hub, rows, [], include_other=True)}
        self.assertEqual(found["a-q8"], {"weight_gb": 7.95})
        self.assertEqual([f["row"]["id"] for f in check_weights(hub, rows, ["B"])], ["b-q4"])


if __name__ == "__main__":
    unittest.main()
