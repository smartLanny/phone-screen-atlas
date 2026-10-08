#!/usr/bin/env python3
"""Copy and digitize the source reflectance plots without inventing raw readings."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "reflectance"
SOURCE_DIR = DATA / "source"
SPEC_PATH = Path(__file__).with_name("source-spec.json")
MANIFEST_PATH = DATA / "source-manifest.json"
INDEX_PATH = DATA / "index.json"
DEFAULT_SOURCE_ROOT = Path("/Volumes/dav/黄海波/手机数据整理/01单机数据")
SKIP_DIRS = {"@eaDir", ".git", "node_modules"}
MAX_SOURCE_BYTES = 2_000_000
PALETTE_DISTANCE = 90.0
SAMPLE_WINDOW_PX = 4
MAX_GRID_GAP_NM = 10


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def source_candidates(source_root: Path) -> list[str]:
    candidates = []
    for base, dirs, files in os.walk(source_root):
        dirs[:] = sorted(name for name in dirs if name not in SKIP_DIRS)
        for name in files:
            lowered = name.lower()
            if not lowered.endswith(".png") or ("反射率" not in name and "reflectance" not in lowered):
                continue
            path = Path(base) / name
            if path.stat().st_size > MAX_SOURCE_BYTES:
                raise ValueError(f"候选反射率图超过读取上限：{path.relative_to(source_root)}")
            candidates.append(path.relative_to(source_root).as_posix())
            if len(candidates) > 100:
                raise ValueError("反射率图文件超过 100 个，请先人工收窄来源清单。")
    return sorted(candidates)


def ingest(source_root: Path, spec: dict) -> dict:
    source_root = source_root.expanduser().resolve()
    expected = sorted(source["sourcePath"] for source in spec["sources"])
    discovered = source_candidates(source_root)
    if discovered != expected:
        missing = sorted(set(expected) - set(discovered))
        unreviewed = sorted(set(discovered) - set(expected))
        raise ValueError(f"来源图清单发生变化；缺少={missing}，待审阅={unreviewed}")

    entries = []
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    for item in spec["sources"]:
        original = source_root / item["sourcePath"]
        size = original.stat().st_size
        if size > MAX_SOURCE_BYTES:
            raise ValueError(f"来源图超过读取上限：{item['sourcePath']}")
        local = SOURCE_DIR / item["copyFile"]
        shutil.copyfile(original, local)
        original_hash = sha256(original)
        copied_hash = sha256(local)
        if original_hash != copied_hash:
            raise ValueError(f"来源图复制后哈希不一致：{item['sourcePath']}")
        with Image.open(local) as image:
            width, height = image.size
            image_format = image.format
        entries.append({
            **item,
            "sourceSha256": original_hash,
            "sourceBytes": size,
            "copySha256": copied_hash,
            "copyBytes": local.stat().st_size,
            "imageFormat": image_format,
            "imageSizePx": [width, height],
        })

    manifest = {
        "schemaVersion": 1,
        "sourceRootLabel": spec["sourceRootLabel"],
        "units": spec["units"],
        "axes": spec["axes"],
        "palette": spec["palette"],
        "digitization": {
            "method": "PNG plot trace sampled from the chart's labelled axes",
            "gridIsInstrumentSampling": False,
            "traceErrorNm": spec["axes"]["traceErrorNm"],
            "traceErrorPercentagePoints": spec["axes"]["traceErrorPercentagePoints"],
            "colorDistanceThreshold": PALETTE_DISTANCE,
            "sampleWindowPx": SAMPLE_WINDOW_PX,
        },
        "phones": spec["phones"],
        "sources": entries,
    }
    return manifest


def cluster_centers(indices: np.ndarray) -> list[int]:
    if indices.size == 0:
        return []
    clusters = []
    current = [int(indices[0])]
    for value in indices[1:]:
        value = int(value)
        if value - current[-1] <= 2:
            current.append(value)
        else:
            clusters.append(current)
            current = [value]
    clusters.append(current)
    return [int(round(float(np.median(cluster)))) for cluster in clusters]


def find_plot_bounds(image: np.ndarray, item: dict) -> tuple[int, int, int, int]:
    height, width, _ = image.shape
    if "plotBoundsPx" in item:
        left, top, right, bottom = item["plotBoundsPx"]
        if not (0 <= left < right < width and 0 <= top < bottom < height):
            raise ValueError(f"图表坐标框超出图像：{item['id']}")
        return left, top, right, bottom

    dark = np.max(image, axis=2) < 80
    x_lines = np.flatnonzero(dark.sum(axis=0) > height * 0.5)
    y_lines = np.flatnonzero(dark.sum(axis=1) > width * 0.5)
    x_centers = cluster_centers(x_lines)
    y_centers = cluster_centers(y_lines)
    if len(x_centers) != 2 or len(y_centers) != 2:
        raise ValueError(f"无法唯一确定图表坐标框，请核对原图：{item['id']} x={x_centers} y={y_centers}")
    left, right = x_centers
    top, bottom = y_centers
    return left, top, right, bottom


def extract_curve(image: np.ndarray, bounds: tuple[int, int, int, int], spec: dict, item: dict, series: dict) -> dict:
    left, top, right, bottom = bounds
    axes = spec["axes"]
    x_min, x_max = axes["wavelengthNm"]
    y_min, y_max = axes["reflectancePercent"]
    range_min, range_max = series.get("rangeNm", [x_min, x_max])
    step = axes["sampleStepNm"]
    color = next(entry["rgb"] for entry in spec["palette"] if entry["name"] == series["color"])
    rgb = image[top:bottom + 1, left:right + 1, :].astype(np.int32)
    target = np.asarray(color, dtype=np.int32)
    distance = np.sqrt(np.sum((rgb - target) ** 2, axis=2))
    local_y = np.arange(top, bottom + 1)[:, None]
    percent_at_row = y_min + (bottom - local_y) * (y_max - y_min) / (bottom - top)
    curve_region = (percent_at_row >= y_min - 0.1) & (percent_at_row <= 6.7)
    color_mask = (distance <= PALETTE_DISTANCE) & curve_region

    samples = []
    max_gap = 0
    previous = None
    for wavelength in range(range_min, range_max + 1, step):
        image_x = int(round(left + (wavelength - x_min) * (right - left) / (x_max - x_min)))
        x0 = max(0, image_x - left - SAMPLE_WINDOW_PX)
        x1 = min(color_mask.shape[1], image_x - left + SAMPLE_WINDOW_PX + 1)
        rows = np.flatnonzero(color_mask[:, x0:x1].any(axis=1))
        if rows.size == 0:
            if previous is not None:
                max_gap = max(max_gap, wavelength - previous)
            continue
        y_pixels = top + float(np.median(rows))
        reflectance = y_min + (bottom - y_pixels) * (y_max - y_min) / (bottom - top)
        samples.append([wavelength, round(float(reflectance), 2)])
        if previous is not None:
            max_gap = max(max_gap, wavelength - previous)
        previous = wavelength

    expected_count = (range_max - range_min) // step + 1
    if len(samples) < expected_count * series.get("minimumCoverageFraction", 0.8):
        raise ValueError(f"曲线颜色点不足：{item['id']} / {series['phoneId']} / {series['kind']} ({len(samples)}/{expected_count})")
    if range_min == x_min and range_max == x_max and max_gap > MAX_GRID_GAP_NM and not series.get("allowLongGap", False):
        raise ValueError(f"全谱曲线存在过大提取缺口：{item['id']} / {series['phoneId']} / {series['kind']} ({max_gap} nm)")

    spans = []
    span_start = span_end = None
    for wavelength, _ in samples:
        if span_end is None or wavelength - span_end > step:
            if span_start is not None:
                spans.append([span_start, span_end])
            span_start = wavelength
        span_end = wavelength
    if span_start is not None:
        spans.append([span_start, span_end])

    return {
        "kind": series["kind"],
        "label": "全反射" if series["kind"] == "total" else "漫反射",
        "method": series.get("method"),
        "methodNote": "源图标注" if series.get("method") else "源图未标注 SCI/SCE",
        "rangeNm": [samples[0][0], samples[-1][0]],
        "coverageSpansNm": spans,
        "samples": samples,
        "allowsLongGap": bool(series.get("allowLongGap", False)),
        "digitized": True,
        "traceErrorNm": axes["traceErrorNm"],
        "traceErrorPercentagePoints": axes["traceErrorPercentagePoints"],
        "legendLabelPercent": series.get("legendPercent"),
        "sourceId": item["id"],
        "sourceFile": f"source/{item['copyFile']}",
        "sourceRelativePath": item["sourcePath"],
        "maxSampleGapNm": max_gap,
    }


def build_index(spec: dict, manifest: dict) -> dict:
    entries_by_id = {entry["id"]: entry for entry in manifest["sources"]}
    phones = {}
    source_bounds = {}
    for source_spec in spec["sources"]:
        if source_spec["role"] != "curve":
            continue
        manifest_item = entries_by_id[source_spec["id"]]
        image_path = SOURCE_DIR / source_spec["copyFile"]
        if sha256(image_path) != manifest_item["copySha256"]:
            raise ValueError(f"本地源图哈希不匹配：{source_spec['id']}")
        with Image.open(image_path) as opened:
            image = np.asarray(opened.convert("RGB"))
        bounds = find_plot_bounds(image, source_spec)
        source_bounds[source_spec["id"]] = {
            "plotBoundsPx": list(bounds),
            "imageSizePx": manifest_item["imageSizePx"],
        }
        for series in source_spec["series"]:
            phone_meta = spec["phones"][series["phoneId"]]
            phone = phones.setdefault(series["phoneId"], {
                "id": series["phoneId"],
                "name": phone_meta["name"],
                **({"panel": phone_meta["panel"]} if phone_meta.get("panel") else {}),
                "conditions": {},
            })
            condition_id = series["conditionId"]
            condition = phone["conditions"].setdefault(condition_id, {
                "id": condition_id,
                "label": series.get("conditionLabel", "原图状态" if condition_id == "as-measured" else condition_id),
                "curves": {},
                "sourceIds": [],
            })
            if source_spec["id"] not in condition["sourceIds"]:
                condition["sourceIds"].append(source_spec["id"])
            curve = extract_curve(image, bounds, spec, source_spec, series)
            if series["kind"] in condition["curves"]:
                prior = condition["curves"][series["kind"]]
                if prior["samples"] != curve["samples"]:
                    raise ValueError(f"同一条件的 {series['kind']} 曲线重复且不一致：{series['phoneId']} / {condition_id}")
            else:
                condition["curves"][series["kind"]] = curve

    order = [
        "xiaomi-18-pro-max", "iphone-18-pro-max", "iphone-17-pro-max", "xiaomi-17-ultra",
        "huawei-mate-90-pro-max", "huawei-mate-80-rs", "huawei-mate-70-air",
    ]
    ordered_phones = []
    for phone_id in order + sorted(set(phones) - set(order)):
        if phone_id not in phones:
            continue
        phone = phones[phone_id]
        conditions = sorted(phone["conditions"].values(), key=lambda item: (item["id"] != "as-measured", item["id"]))
        availability = "complete" if any(
            all(kind in condition["curves"] and condition["curves"][kind]["rangeNm"] == spec["axes"]["wavelengthNm"] for kind in ("total", "diffuse"))
            for condition in conditions
        ) else "partial"
        ordered_phones.append({
            "id": phone["id"],
            "name": phone["name"],
            **({"panel": phone["panel"]} if phone.get("panel") else {}),
            "availability": availability,
            "conditions": conditions,
        })

    return {
        "schemaVersion": 1,
        "units": spec["units"],
        "wavelengthRangeNm": spec["axes"]["wavelengthNm"],
        "reflectanceRangePercent": spec["axes"]["reflectancePercent"],
        "digitization": manifest["digitization"],
        "phoneCount": len(ordered_phones),
        "sourceManifest": "source-manifest.json",
        "phones": ordered_phones,
        "sourcePlotBounds": source_bounds,
    }


def verify(spec: dict, manifest: dict, index: dict):
    if manifest["sourceRootLabel"] != spec["sourceRootLabel"]:
        raise ValueError("来源根目录标签与 source-spec 不符。")
    manifest_ids = {entry["id"] for entry in manifest["sources"]}
    spec_ids = {entry["id"] for entry in spec["sources"]}
    if manifest_ids != spec_ids:
        raise ValueError("source-manifest 与 source-spec 的文件 id 不一致。")
    for entry in manifest["sources"]:
        path = SOURCE_DIR / entry["copyFile"]
        if not path.is_file() or path.stat().st_size != entry["copyBytes"] or sha256(path) != entry["copySha256"]:
            raise ValueError(f"源图副本缺失或哈希变化：{entry['id']}")
        if entry["sourceSha256"] != entry["copySha256"]:
            raise ValueError(f"NAS 来源与本地源图副本哈希不一致：{entry['id']}")
    rebuilt = build_index(spec, manifest)
    if rebuilt != index:
        raise ValueError("index.json 与来源图离线重建结果不一致。")
    if index["units"] != {"wavelength": "nm", "reflectance": "%"}:
        raise ValueError("图轴单位错误。")
    for phone in index["phones"]:
        for condition in phone["conditions"]:
            for curve in condition["curves"].values():
                waves = [sample[0] for sample in curve["samples"]]
                values = [sample[1] for sample in curve["samples"]]
                if waves != sorted(set(waves)):
                    raise ValueError(f"波长重复或未递增：{phone['id']} / {curve['kind']}")
                if min(values) < 0 or max(values) > 10:
                    raise ValueError(f"反射率超出源图 y 轴范围：{phone['id']} / {curve['kind']}")
                if curve["rangeNm"] != [waves[0], waves[-1]]:
                    raise ValueError(f"谱段记录与实际点列不一致：{phone['id']} / {curve['kind']}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("ingest", "rebuild", "check"))
    parser.add_argument("--source-root", type=Path, default=DEFAULT_SOURCE_ROOT)
    args = parser.parse_args()
    spec = read_json(SPEC_PATH)
    if args.action == "ingest":
        manifest = ingest(args.source_root, spec)
        index = build_index(spec, manifest)
        write_json(MANIFEST_PATH, manifest)
        write_json(INDEX_PATH, index)
        print(f"已复制 {len(manifest['sources'])} 张图，提取 {len(index['phones'])} 部设备的反射曲线。")
        return 0

    manifest = read_json(MANIFEST_PATH)
    index = build_index(spec, manifest)
    if args.action == "rebuild":
        write_json(INDEX_PATH, index)
        print(f"已离线重建 {len(index['phones'])} 部设备的反射率索引。")
        return 0
    verify(spec, manifest, read_json(INDEX_PATH))
    print(f"来源副本、哈希、轴单位、曲线顺序与离线重建：PASS（{len(index['phones'])} 部设备）")
    print(f"数字化精度口径：±{spec['axes']['traceErrorNm']} nm，±{spec['axes']['traceErrorPercentagePoints']:.2f} 个百分点；网格步长 {spec['axes']['sampleStepNm']} nm，不代表仪器采样间隔。")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError) as error:
        print(f"reflectance rebuild failed: {error}", file=sys.stderr)
        sys.exit(1)
