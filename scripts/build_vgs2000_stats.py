from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from build_combined_stats import (
    aggregate_events,
    aggregate_geo,
    aggregate_monthly,
    aggregate_sources,
    aggregate_summary,
    aggregate_utm,
)
from extract_tilda_stats import build_dataset


INPUT_DIR = Path("/Users/kristinakarpova/Downloads/статистика")
INPUTS = sorted([*INPUT_DIR.glob("*.html"), *INPUT_DIR.glob("*.htm")])
OUTPUT = Path("/Users/kristinakarpova/statistic/data/vgs2000-stats.json")


def aggregate_pages_by_url(datasets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[str, dict[str, Any]] = {}

    for dataset in datasets:
        site = dataset["project"]["site"]
        for page in dataset["pages"]:
            key = page["url"].strip().lower()
            bucket = buckets.setdefault(
                key,
                {
                    "title": page["title"],
                    "url": page["url"],
                    "path": page["path"],
                    "sites": set(),
                    "views": 0,
                    "sessions": 0,
                    "visitors": 0,
                    "shareSum": [0.0, 0.0],
                    "shareWeight": 0,
                },
            )
            bucket["sites"].add(site)
            bucket["views"] += page["views"]
            bucket["sessions"] += page["sessions"]
            bucket["visitors"] += page["visitors"]
            bucket["shareSum"][0] += page["share"][0] * page["sessions"]
            bucket["shareSum"][1] += page["share"][1] * page["sessions"]
            bucket["shareWeight"] += page["sessions"]

    pages = []
    for bucket in buckets.values():
        weight = bucket["shareWeight"] or 1
        pages.append(
            {
                "title": bucket["title"],
                "url": bucket["url"],
                "path": bucket["path"],
                "sites": sorted(bucket["sites"]),
                "views": bucket["views"],
                "sessions": bucket["sessions"],
                "visitors": bucket["visitors"],
                "share": [
                    round(bucket["shareSum"][0] / weight, 2),
                    round(bucket["shareSum"][1] / weight, 2),
                ],
            }
        )

    pages.sort(key=lambda item: item["sessions"], reverse=True)
    return pages


def aggregate_products_by_url(datasets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[str, dict[str, Any]] = {}

    for dataset in datasets:
        site = dataset["project"]["site"]
        for product in dataset["products"]:
            key = product["url"].strip().lower()
            bucket = buckets.setdefault(
                key,
                {
                    "name": product["name"],
                    "url": product["url"],
                    "sites": set(),
                    "views": 0,
                    "sessions": 0,
                    "visitors": 0,
                    "shareSum": [0.0, 0.0],
                    "shareWeight": 0,
                },
            )
            bucket["sites"].add(site)
            bucket["views"] += product["views"]
            bucket["sessions"] += product["sessions"]
            bucket["visitors"] += product["visitors"]
            bucket["shareSum"][0] += product["share"][0] * product["sessions"]
            bucket["shareSum"][1] += product["share"][1] * product["sessions"]
            bucket["shareWeight"] += product["sessions"]

    products = []
    for bucket in buckets.values():
        weight = bucket["shareWeight"] or 1
        products.append(
            {
                "name": bucket["name"],
                "url": bucket["url"],
                "sites": sorted(bucket["sites"]),
                "views": bucket["views"],
                "sessions": bucket["sessions"],
                "visitors": bucket["visitors"],
                "share": [
                    round(bucket["shareSum"][0] / weight, 2),
                    round(bucket["shareSum"][1] / weight, 2),
                ],
            }
        )

    products.sort(key=lambda item: item["sessions"], reverse=True)
    return products


def build_vgs2000_dataset() -> dict[str, Any]:
    datasets = [build_dataset(path) for path in INPUTS]
    ranges = {dataset["project"]["range"] for dataset in datasets}
    site_rows = [
        {
            "site": dataset["project"]["site"],
            "title": dataset["project"]["title"],
            "sessions": dataset["summary"]["sessions"]["value"],
            "views": dataset["summary"]["views"],
            "visitors": dataset["summary"]["visitors"],
            "leads": dataset["summary"]["leads"]["value"],
        }
        for dataset in datasets
    ]
    site_rows.sort(key=lambda item: item["sessions"], reverse=True)

    return {
        "project": {
            "title": "Общая статистика VGS2000",
            "site": "Все сайты VGS2000",
            "range": ranges.pop() if len(ranges) == 1 else "Несколько периодов",
            "sites": site_rows,
        },
        "summary": aggregate_summary(datasets),
        "monthly": aggregate_monthly(datasets),
        "pages": aggregate_pages_by_url(datasets),
        "products": aggregate_products_by_url(datasets),
        "utm": aggregate_utm(datasets),
        "events": aggregate_events(datasets),
        "sources": aggregate_sources(datasets),
        "geo": aggregate_geo(datasets),
    }


def main() -> None:
    if not INPUTS:
        raise SystemExit(f"No Tilda exports found in {INPUT_DIR}")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    dataset = build_vgs2000_dataset()
    serialized = json.dumps(dataset, ensure_ascii=False, indent=2)
    OUTPUT.write_text(serialized, encoding="utf-8")
    OUTPUT.with_suffix(".js").write_text(f"window.TILDA_STATS_DATA = {serialized};\n", encoding="utf-8")
    print(f"Wrote {OUTPUT}")
    print(f"Wrote {OUTPUT.with_suffix('.js')}")


if __name__ == "__main__":
    main()
