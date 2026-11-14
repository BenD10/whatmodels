"""Tests for gguf_repo / gguf_shards: validation, llama.cpp tag resolution and
the backfill's repo matching. Run from the repo root:

    python3 -m unittest discover -s scripts/tests
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "models"))

from backfill_gguf_repo import name_matches, size_match, with_repo  # noqa: E402
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


if __name__ == "__main__":
    unittest.main()
