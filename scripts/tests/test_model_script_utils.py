"""Regression tests for KV-cache derivation in add_model.py.

Fixtures in tests/configs/ are real Hugging Face config.json files, trimmed to
the fields the scripts read. Each expected value is what llama.cpp-style
allocation implies, and several of them were wrong in models.json before these
rules existed. Run from the repo root:

    python3 -m unittest discover -s scripts/tests
"""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from add_model import context_k_from, derive_architecture  # noqa: E402
from model_script_utils import count_attention_layers, text_config_of  # noqa: E402

CONFIGS = Path(__file__).parent / "configs"


def load(name: str) -> dict:
    return json.loads((CONFIGS / f"{name}.json").read_text())


class DeriveArchitectureTest(unittest.TestCase):
    # (fixture, kv_per_1k_gb, kv-caching layers, total layers, max context in K)
    CASES = [
        # Dense full attention
        ("llama-3.1-8b", 0.122, 32, 32, 128),
        # Mixed linear / full attention: only full layers cache
        ("qwen3.5-27b", 0.061, 16, 64, 256),
        # MLA: one compressed latent per token per layer (no ×2 for K+V)
        ("deepseek-r1", 0.065, 61, 61, 160),
        ("glm-5.1", 0.084, 78, 78, 198),
        # Nemotron-H: layers_block_type, the older hybrid_override_pattern, and a VL wrapper
        ("nemotron-3.5-lightning", 0.006, 6, 52, 256),
        ("nemotron-cascade-2", 0.006, 6, 52, 256),
        ("nemotron-3.5-super-vl", 0.008, 8, 88, 1024),
        # Gemma 4: text_config wrapper; full layers use the global head count and size
        ("gemma-4-31B", 0.076, 10, 60, 256),
        ("gemma-4-12B", 0.015, 8, 48, 256),
        # Gemma 4 "E" models: the last num_kv_shared_layers layers reuse earlier caches
        ("gemma-4-E4B", 0.015, 4, 42, 128),
        ("gemma-4-E2B", 0.006, 3, 35, 128),
        # Gemma 3: no layer_types, only sliding_window_pattern (1024-token window)
        ("gemma-3-27b", 0.076, 10, 62, 128),
        # Short (128-token) sliding window: those layers don't count
        ("gpt-oss-20b", 0.023, 12, 24, 128),
        # Wide windows/chunks (4K, 32K, 8K) grow like full attention at normal contexts
        ("gemma-2-9b", 0.320, 42, 42, 8),
        ("ministral-8b", 0.137, 36, 36, 32),  # config says 32K; the card (and models.json) say 128K
        ("llama-4-scout", 0.183, 48, 48, 10240),
    ]

    def test_known_models(self):
        for name, kv, caching, total, context_k in self.CASES:
            with self.subTest(name):
                config = load(name)
                arch = derive_architecture(config)
                self.assertAlmostEqual(arch["kv_per_1k_gb"], kv, places=3)
                self.assertEqual(arch["attention_layers"], caching)
                self.assertEqual(arch["layers"], total)
                self.assertEqual(context_k_from(config, None), context_k)


class LayerCountingTest(unittest.TestCase):
    def test_unwraps_multimodal_configs(self):
        self.assertIn("layers_block_type", text_config_of(load("nemotron-3.5-super-vl")))
        self.assertIn("layer_types", text_config_of(load("gemma-4-E4B")))

    def test_plain_configs_count_every_layer(self):
        self.assertEqual(count_attention_layers({"num_hidden_layers": 40}), (40, 40))

    def test_unknown_layer_types_fail_loudly(self):
        with self.assertRaises(ValueError):
            count_attention_layers({"num_hidden_layers": 2, "layer_types": ["weird_attention", "mamba"]})


if __name__ == "__main__":
    unittest.main()
