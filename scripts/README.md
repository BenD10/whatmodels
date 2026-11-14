# Data Management Scripts

Scripts are organized by domain. Each folder holds its scripts plus the shared
module they import, and has its own README with full usage:

- [`models/`](models/README.md) manages `src/lib/data/models.json` (shared logic in `models/model_script_utils.py`)
- [`gpus/`](gpus/README.md) manages `src/lib/data/gpus.json` (shared logic in `gpus/gpu_script_utils.py`)
- `tests/` holds unit tests for the model scripts, with trimmed real `config.json` fixtures in `tests/configs/`

Run everything from the repo root.

## Quick Start

### Model scripts

```bash
python3 scripts/models/add_model.py --name "Qwen3.8 27B" \
    --config-repo Qwen/Qwen3.8-27B --gguf-repo unsloth/Qwen3.8-27B-GGUF \
    --quant Q4_K_M --quant Q8_0 --features vision,tool_use,reasoning
python3 scripts/models/extract_model_ids.py
python3 scripts/models/list_recent_models.py --days 30 --short
python3 scripts/models/update_model_stats.py --report
```

### GPU scripts

```bash
python3 scripts/gpus/add_gpu.py "GeForce RTX 5090" --manufacturer NVIDIA --vram 32 --bandwidth 1792
python3 scripts/gpus/extract_gpu_ids.py
python3 scripts/gpus/list_recent_gpus.py --manufacturer NVIDIA --limit 10
python3 scripts/gpus/update_gpu_specs.py rtx-5090 --vram 32 --bandwidth 1792
```

### Tests

```bash
python3 -m unittest discover -s scripts/tests
```

## Dependencies

- Python 3.9+, stdlib only
- `list_recent_models.py` also needs `requests` (`pip install requests`)
