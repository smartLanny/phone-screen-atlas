#!/usr/bin/env python3
"""Package the existing uniformity maps as portrait assets for Screen Atlas.

This does not recompute measurements. It validates the supplied maps.json against
maps.js and uniformity_metrics.json, rotates the exported PNGs to portrait, and
writes the module manifest plus a local audit record.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = ROOT / "data" / "uniformity"
DEFAULT_EVIDENCE = ROOT.parents[1] / "work" / "uniformity"

PHONES = {
    "mi18pm": ("xiaomi-18-pro-max", "小米 18 Pro Max", "has-maps"),
    "ip18pm": ("iphone-18-pro-max", "iPhone 18 Pro Max", "has-maps"),
    "mi17u": ("xiaomi-17-ultra", "小米 17 Ultra 徕卡", "has-maps"),
}
METRIC_SOURCE_IDS = {
    "iphone-17-pro-max": "ip17pm",
    "huawei-mate-80-rs": "m80rs",
    "huawei-mate-70-air": "m70a",
}
RAW_MATRIX_FILES = {
    "mi18pm": {
        "300": {"lum": "小米 18 Pro Max/04源数据/均匀性/300亮度.txt", "cct": "小米 18 Pro Max/04源数据/均匀性/300色温.txt"},
        "100": {"lum": "小米 18 Pro Max/04源数据/均匀性/100nits g20亮度.txt", "cct": "小米 18 Pro Max/04源数据/均匀性/100nits g20色温.txt"},
        "10": {"lum": "小米 18 Pro Max/04源数据/均匀性/10nits g20亮度.txt"},
    },
    "ip18pm": {
        "300": {"lum": "Apple iPhone 18 Pro Max/03源文件/均匀性 260920/300nits 亮度均匀性.txt", "cct": "Apple iPhone 18 Pro Max/03源文件/均匀性 260920/300nits 色温均匀性.txt"},
        "100": {"lum": "Apple iPhone 18 Pro Max/03源文件/均匀性 260920/100nits g20 亮度均匀性.txt", "cct": "Apple iPhone 18 Pro Max/03源文件/均匀性 260920/100nits g20 色温均匀性.txt"},
        "10": {"lum": "Apple iPhone 18 Pro Max/03源文件/均匀性 260920/10nits g20 亮度均匀性.txt"},
    },
    "mi17u": {
        "300": {"lum": "小米 17 Ultra 徕卡/04原始数据/小米17Ultra徕卡 300nits 亮度.txt", "cct": "小米 17 Ultra 徕卡/04原始数据/小米17Ultra徕卡 300nits 色温.txt"},
        "100": {"lum": "小米 17 Ultra 徕卡/04原始数据/260106 100nits g20 亮度.txt", "cct": "小米 17 Ultra 徕卡/04原始数据/260106 100nits g20 色温.txt"},
        "10": {"lum": "小米 17 Ultra 徕卡/04原始数据/小米17Ultra徕卡 10nits g20 亮度.txt"},
    },
}
CANONICAL = [
    ("xiaomi-18-pro-max", "小米 18 Pro Max", "has-maps"),
    ("iphone-18-pro-max", "iPhone 18 Pro Max", "has-maps"),
    ("iphone-17-pro-max", "iPhone 17 Pro Max", "metrics-only"),
    ("xiaomi-17-ultra", "小米 17 Ultra 徕卡", "has-maps"),
    ("huawei-mate-90-pro-max", "华为 Mate 90 Pro Max 典藏版", "not-recorded"),
    ("huawei-mate-80-rs", "华为 Mate 80 RS", "metrics-only"),
    ("huawei-mate-70-air", "华为 Mate 70 Air", "metrics-only"),
]
LEVELS = {
    "300": {"label": "300 nits 白场", "pattern": "全白场", "referenceNits": 300},
    "100": {"label": "100 nits G20", "pattern": "G20", "referenceNits": 100},
    "10": {"label": "10 nits G20", "pattern": "G20", "referenceNits": 10},
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_maps_js(path: Path) -> dict:
    text = path.read_text(encoding="utf-8").strip()
    prefix = "window.UNIF = "
    if not text.startswith(prefix) or not text.endswith(";"):
        raise ValueError(f"unexpected maps.js wrapper: {path}")
    return json.loads(text[len(prefix) : -1])


def metric_lookup(rows: list[dict]) -> dict[tuple[str, str, str], dict]:
    lookup = {}
    for row in rows:
        if row.get("cond", "") == "":
            lookup[(row.get("id"), row.get("level"), row.get("kind"))] = row
    return lookup


def matrix_dimensions(path: Path) -> tuple[int, int]:
    lines = path.read_bytes().split(b"\r\n")
    start = next(index for index, line in enumerate(lines) if line.count(b"\t") > 100)
    widths = [len(line.rstrip(b"\t").split(b"\t")) for line in lines[start:] if line.count(b"\t") > 100]
    if not widths:
        raise ValueError(f"measurement matrix not found: {path}")
    return len(widths), min(widths)


def rotate_asset(source: Path, output: Path) -> dict:
    with Image.open(source) as image:
        image.load()
        if image.mode != "RGBA":
            raise ValueError(f"expected the source screen mask in RGBA alpha: {source}")
        source_size = list(image.size)
        alpha = image.getchannel("A")
        alpha_bbox = alpha.getbbox()
        alpha_pixels = int(np.count_nonzero(np.asarray(alpha)))
        source_pixels = image.width * image.height
        portrait = image.transpose(Image.Transpose.ROTATE_270)
        output.parent.mkdir(parents=True, exist_ok=True)
        portrait.save(output, format="PNG", optimize=False, compress_level=1)
        output_size = list(portrait.size)
        with Image.open(output) as check:
            if check.mode != "RGBA" or check.size != (source_size[1], source_size[0]):
                raise ValueError(f"rotated map has unexpected mode or dimensions: {output}")
            check.load()
            if check.tobytes() != portrait.tobytes():
                raise ValueError(f"rotated map pixels differ from the lossless source transform: {output}")
    return {
        "sourceResolution": source_size,
        "displayResolution": output_size,
        "sourceMaskBounds": list(alpha_bbox) if alpha_bbox else None,
        "sourceMaskCoverage": round(alpha_pixels / source_pixels, 6),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True, help="directory containing maps.json, maps.js and source PNGs")
    parser.add_argument("--metrics", type=Path, help="uniformity_metrics.json; defaults to ../uniformity_metrics.json")
    parser.add_argument("--measurements-root", type=Path, help="optional read-only root with original Radiant measurement TXT files")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--evidence-dir", type=Path, default=DEFAULT_EVIDENCE)
    args = parser.parse_args()

    source_dir = args.source_dir.resolve()
    maps_json_path = source_dir / "maps.json"
    maps_js_path = source_dir / "maps.js"
    metrics_path = (args.metrics or source_dir.parent / "uniformity_metrics.json").resolve()
    for path in (maps_json_path, maps_js_path, metrics_path):
        if not path.is_file():
            raise FileNotFoundError(path)

    maps_document = json.loads(maps_json_path.read_text(encoding="utf-8"))
    js_document = load_maps_js(maps_js_path)
    if maps_document != js_document:
        raise ValueError("maps.js payload does not match maps.json")
    metrics_rows = json.loads(metrics_path.read_text(encoding="utf-8"))
    metrics = metric_lookup(metrics_rows)
    measurements_root = args.measurements_root.resolve() if args.measurements_root else None
    source_maps = maps_document.get("maps", {})
    stops = maps_document.get("stops")
    if not isinstance(stops, list) or not stops:
        raise ValueError("maps.json has no color stops")

    output_dir = args.output_dir.resolve()
    maps_dir = output_dir / "maps"
    maps_dir.mkdir(parents=True, exist_ok=True)
    phones = []
    metrics_only = []
    not_recorded = []
    audit_maps = []
    expected_keys = set()

    for phone_id, name, state in CANONICAL:
        source_id = next((key for key, value in PHONES.items() if value[0] == phone_id), None)
        phone = {"id": phone_id, "name": name, "heatmapStatus": state, "conditions": []}
        if source_id:
            for level, condition_meta in LEVELS.items():
                lum_key = f"{level}_lum_{source_id}"
                cct_key = f"{level}_cct_{source_id}"
                if lum_key not in source_maps:
                    raise ValueError(f"missing required map metadata: {lum_key}")
                condition = {
                    "id": level,
                    **condition_meta,
                    "maps": {},
                    "metrics": {},
                }
                for key, source_kind, result_kind in (
                    (lum_key, "lum", "luminance"),
                    (cct_key, "cct", "colorTemperature"),
                ):
                    meta = source_maps.get(key)
                    if meta is None:
                        if source_kind == "lum":
                            raise ValueError(f"missing required map metadata: {key}")
                        continue
                    expected_keys.add(key)
                    row = metrics.get((source_id, level, source_kind))
                    if row is None:
                        raise ValueError(f"no default-condition metric row for {key}")
                    if abs(float(row["typ"]) - float(meta["typ"])) > 1e-6:
                        raise ValueError(f"typical value mismatch between maps and metrics: {key}")
                    if source_kind == "lum":
                        for field in ("u9", "ua", "dev10"):
                            if abs(float(row[field]) - float(meta[field])) > 1e-6:
                                raise ValueError(f"{field} metric mismatch: {key}")
                        condition["metrics"][result_kind] = {
                            "typical": round(float(meta["typ"]), 6),
                            "unit": "nit",
                            "ninePointUniformityPct": round(float(meta["u9"]), 4),
                            "areaUniformityPct": round(float(meta["ua"]), 4),
                            "deviation10PctArea": round(float(meta["dev10"]), 4),
                        }
                    else:
                        for field in ("d9", "da"):
                            if abs(float(row[field]) - float(meta[field])) > 1e-6:
                                raise ValueError(f"{field} color-temperature metric mismatch: {key}")
                        condition["metrics"][result_kind] = {
                            "typical": round(float(meta["typ"]), 3),
                            "unit": "K",
                            "ninePointSpreadK": round(float(meta["d9"]), 3),
                            "areaSpreadK": round(float(meta["da"]), 3),
                        }

                    src = source_dir / f"{key}.png"
                    if not src.is_file():
                        raise FileNotFoundError(src)
                    asset_name = f"{key}.png"
                    target = maps_dir / asset_name
                    raster = rotate_asset(src, target)
                    data_map = {
                        "asset": f"maps/{asset_name}",
                        "sourceKey": key,
                        "sourceSha256": sha256(src),
                        "assetSha256": sha256(target),
                        **raster,
                    }
                    if measurements_root:
                        relative_matrix_path = RAW_MATRIX_FILES[source_id][level][source_kind]
                        matrix_path = measurements_root / relative_matrix_path
                        if not matrix_path.is_file():
                            raise FileNotFoundError(matrix_path)
                        rows, columns = matrix_dimensions(matrix_path)
                        data_map["measurementResolution"] = [columns, rows]
                        data_map["measurementSourceSha256"] = sha256(matrix_path)
                        data_map["measurementSource"] = relative_matrix_path
                    if source_kind == "lum":
                        data_map["scale"] = {
                            "minPercentOfTypical": float(meta["lo_pct"]),
                            "maxPercentOfTypical": float(meta["hi_pct"]),
                        }
                    else:
                        data_map["scale"] = {
                            "minOffsetFromTypicalK": round(float(meta["lo"]) - float(meta["typ"]), 3),
                            "maxOffsetFromTypicalK": round(float(meta["hi"]) - float(meta["typ"]), 3),
                        }
                    condition["maps"][result_kind] = data_map
                    audit_maps.append({"phone": phone_id, "condition": level, "kind": result_kind, **data_map})
                phone["conditions"].append(condition)
        elif state == "metrics-only":
            metric_source_id = METRIC_SOURCE_IDS[phone_id]
            if not any(row.get("id") == metric_source_id for row in metrics_rows):
                raise ValueError(f"metrics-only source record missing for {phone_id}")
            metrics_only.append({"id": phone_id, "name": name, "metricSourceId": metric_source_id, "conditions": []})
        else:
            not_recorded.append({"id": phone_id, "name": name, "conditions": []})
        if source_id:
            phones.append(phone)

    actual_expected_keys = {key for key in source_maps if re.fullmatch(r"(?:300|100|10)_(?:lum|cct)_(?:mi18pm|ip18pm|mi17u)", key)}
    if expected_keys != actual_expected_keys:
        raise ValueError(f"unexpected/missing curated source maps: expected {sorted(expected_keys)}, found {sorted(actual_expected_keys)}")

    source_files = {
        "mapsJson": {"path": "data/unif/maps.json", "sha256": sha256(maps_json_path)},
        "mapsJs": {"path": "data/unif/maps.js", "sha256": sha256(maps_js_path)},
        "metricsJson": {"path": "data/uniformity_metrics.json", "sha256": sha256(metrics_path)},
    }
    manifest = {
        "schemaVersion": 1,
        "defaultPhone": "xiaomi-18-pro-max",
        "defaultCondition": "300",
        "defaultMap": "luminance",
        "colorStops": stops,
        "sources": source_files,
        "phones": phones,
        "metricsOnly": metrics_only,
        "notRecorded": not_recorded,
    }
    (output_dir / "index.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    audit = {
        "sourceFiles": source_files,
        "sourceMapCount": len(source_maps),
        "packagedMapCount": len(audit_maps),
        "mapsJsMatchesMapsJson": True,
        "allPackagedMapsMatchMetrics": True,
        "maps": audit_maps,
        "phoneStatus": [{"id": item[0], "name": item[1], "heatmapStatus": item[2]} for item in CANONICAL],
    }
    args.evidence_dir.mkdir(parents=True, exist_ok=True)
    (args.evidence_dir / "source-audit.json").write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"packaged {len(audit_maps)} maps for {sum(bool(phone['conditions']) for phone in phones)} phones")
    print(f"manifest: {output_dir / 'index.json'}")
    print(f"audit: {args.evidence_dir / 'source-audit.json'}")


if __name__ == "__main__":
    main()
