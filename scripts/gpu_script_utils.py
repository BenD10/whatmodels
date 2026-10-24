#!/usr/bin/env python3
"""Shared helpers for maintaining src/lib/data/gpus.json."""

import json
import re
from pathlib import Path

GPU_DATA_PATH = Path(__file__).parent.parent / "src" / "lib" / "data" / "gpus.json"
VALID_MANUFACTURERS = ("NVIDIA", "AMD", "Intel", "Apple")
GPU_ID_PATTERN = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
MANUFACTURER_ORDER = {name: idx for idx, name in enumerate(VALID_MANUFACTURERS)}


def load_gpus(gpus_file: Path = GPU_DATA_PATH) -> list[dict]:
    with open(gpus_file, "r", encoding="utf-8") as f:
        return json.load(f)


def save_gpus(gpus: list[dict], gpus_file: Path = GPU_DATA_PATH) -> None:
    with open(gpus_file, "w", encoding="utf-8") as f:
        json.dump(gpus, f, indent=2)
        f.write("\n")


def slugify_gpu_id(name: str) -> str:
    slug = name.lower()
    slug = slug.replace("+", " plus ")
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug


def _validate_discrete(entry: dict) -> list[str]:
    errors = []
    if "vram_gb" not in entry or "bandwidth_gbps" not in entry:
        errors.append("Discrete GPU requires both 'vram_gb' and 'bandwidth_gbps'.")
        return errors
    if "vram_options" in entry:
        errors.append("Discrete GPU cannot also include 'vram_options'.")
    vram = entry.get("vram_gb")
    bandwidth = entry.get("bandwidth_gbps")
    if not isinstance(vram, (int, float)) or vram <= 0:
        errors.append("'vram_gb' must be a positive number.")
    if not isinstance(bandwidth, (int, float)) or bandwidth <= 0:
        errors.append("'bandwidth_gbps' must be a positive number.")
    return errors


def _validate_unified(entry: dict) -> list[str]:
    errors = []
    options = entry.get("vram_options")
    if "vram_gb" in entry or "bandwidth_gbps" in entry:
        errors.append("GPU with 'vram_options' cannot have top-level VRAM/bandwidth fields.")
    if not isinstance(options, list) or not options:
        errors.append("'vram_options' must be a non-empty list.")
        return errors

    prev_vram = None
    seen_vram = set()
    for idx, opt in enumerate(options):
        if not isinstance(opt, dict):
            errors.append(f"vram_options[{idx}] must be an object.")
            continue
        vram = opt.get("vram_gb")
        bandwidth = opt.get("bandwidth_gbps")
        if not isinstance(vram, (int, float)) or vram <= 0:
            errors.append(f"vram_options[{idx}].vram_gb must be a positive number.")
        if not isinstance(bandwidth, (int, float)) or bandwidth <= 0:
            errors.append(f"vram_options[{idx}].bandwidth_gbps must be a positive number.")
        if isinstance(vram, (int, float)):
            if prev_vram is not None and vram <= prev_vram:
                errors.append("'vram_options' must be sorted by ascending vram_gb with no duplicates.")
            if vram in seen_vram:
                errors.append(f"Duplicate vram_gb value in vram_options: {vram}")
            seen_vram.add(vram)
            prev_vram = vram
    return errors


def validate_gpu_entry(entry: dict, existing_ids: set[str] | None = None, allow_existing_id: bool = False) -> list[str]:
    errors = []

    gpu_id = entry.get("id")
    name = entry.get("name")
    manufacturer = entry.get("manufacturer")

    if not isinstance(gpu_id, str) or not gpu_id:
        errors.append("'id' is required and must be a non-empty string.")
    elif not GPU_ID_PATTERN.match(gpu_id):
        errors.append("'id' must be kebab-case (lowercase letters/numbers/hyphens).")
    elif existing_ids and gpu_id in existing_ids and not allow_existing_id:
        errors.append(f"GPU id '{gpu_id}' already exists.")

    if not isinstance(name, str) or not name.strip():
        errors.append("'name' is required and must be a non-empty string.")

    if manufacturer not in VALID_MANUFACTURERS:
        valid = ", ".join(VALID_MANUFACTURERS)
        errors.append(f"'manufacturer' must be one of: {valid}.")

    has_unified = "vram_options" in entry
    if has_unified:
        errors.extend(_validate_unified(entry))
    else:
        errors.extend(_validate_discrete(entry))

    errors.extend(_validate_shopping(entry))
    return errors


def _validate_shopping(entry: dict) -> list[str]:
    """msrp_usd and amazon_search are required keys; either may be null."""
    errors = []
    if "msrp_usd" not in entry:
        errors.append("'msrp_usd' is required (use null when unknown).")
    else:
        msrp = entry["msrp_usd"]
        if msrp is not None and (isinstance(msrp, bool) or not isinstance(msrp, (int, float)) or not 0 < msrp <= 50000):
            errors.append("'msrp_usd' must be null or a positive number of US dollars (at most 50000).")
    if "amazon_search" not in entry:
        errors.append("'amazon_search' is required (use null when the GPU isn't sold).")
    else:
        query = entry["amazon_search"]
        if query is not None and (not isinstance(query, str) or not query.strip()):
            errors.append("'amazon_search' must be null or a non-empty search phrase.")
        elif isinstance(query, str) and ("://" in query or "tag=" in query):
            errors.append("'amazon_search' must be a plain search phrase, not a URL or affiliate tag.")
    return errors


def default_amazon_search(name: str, manufacturer: str) -> str:
    """A sensible Amazon search phrase for a GPU: 'GeForce RTX 4060' -> 'RTX 4060'."""
    name = name.strip()
    if manufacturer == "Apple":
        # Apple chips aren't sold alone; search for the machines that carry them
        family = "Mac Studio" if "Ultra" in name else "MacBook Pro" if ("Max" in name or "Pro" in name) else "MacBook Air"
        return f"{family} {name}"
    if manufacturer == "NVIDIA":
        return name.removeprefix("GeForce ") if name.startswith("GeForce ") else f"NVIDIA {name}"
    if manufacturer == "Intel":
        return f"Intel {name}"
    if manufacturer == "AMD" and not name.startswith(("Radeon", "AMD")):
        return f"AMD {name}"
    return name


def normalize_number(value: float | int) -> float | int:
    value = float(value)
    return int(value) if value.is_integer() else round(value, 2)


def normalize_options(vram_options: list[dict]) -> list[dict]:
    normalized = []
    for opt in vram_options:
        normalized.append(
            {
                "vram_gb": normalize_number(opt["vram_gb"]),
                "bandwidth_gbps": normalize_number(opt["bandwidth_gbps"]),
            }
        )
    normalized.sort(key=lambda o: o["vram_gb"])
    return normalized


def insert_gpu_with_order(gpus: list[dict], new_gpu: dict) -> list[dict]:
    """
    Insert GPU while preserving grouped manufacturer ordering.
    Within manufacturer blocks, new entries are inserted first (newest-first).
    """
    manufacturer = new_gpu["manufacturer"]
    first_same_idx = next((i for i, gpu in enumerate(gpus) if gpu.get("manufacturer") == manufacturer), None)
    if first_same_idx is not None:
        gpus.insert(first_same_idx, new_gpu)
        return gpus

    new_order = MANUFACTURER_ORDER.get(manufacturer, 999)
    insert_idx = len(gpus)
    for i, gpu in enumerate(gpus):
        current_order = MANUFACTURER_ORDER.get(gpu.get("manufacturer"), 999)
        if current_order > new_order:
            insert_idx = i
            break
    gpus.insert(insert_idx, new_gpu)
    return gpus
