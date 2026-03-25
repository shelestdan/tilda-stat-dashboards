from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from extract_tilda_stats import build_dataset


INPUTS = [
    Path("/Users/kristinakarpova/Downloads/Статистика сайта - РВЗ Северная... - Tilda.html"),
    Path("/Users/kristinakarpova/Downloads/Статистика сайта - РВЗ ЗАВОД ПРОМО - Tilda.htm"),
]

OUTPUT = Path("/Users/kristinakarpova/statistic/data/site-stats.json")


def previous_value(current: float, delta_percent: float) -> float:
    if delta_percent == 0:
        return current
    if abs(1 + delta_percent / 100) < 1e-9:
        # Tilda can report -100% when the current value is zero, and the previous
        # period cannot be reconstructed from the export alone.
        return 0.0
    return current / (1 + delta_percent / 100)


def merge_count_items(items: list[dict[str, Any]], label_key: str = "label") -> list[dict[str, Any]]:
    buckets: dict[str, dict[str, Any]] = {}

    for item in items:
        label = item[label_key]
        key = str(label).strip().lower()
        bucket = buckets.setdefault(
            key,
            {
                label_key: label,
                "count": 0,
            },
        )
        bucket["count"] += item.get("count", 0)

    total = sum(bucket["count"] for bucket in buckets.values()) or 1
    result = []
    for bucket in buckets.values():
        result.append(
            {
                label_key: bucket[label_key],
                "count": bucket["count"],
                "share": round(bucket["count"] / total * 100, 2),
            }
        )

    result.sort(key=lambda item: item["count"], reverse=True)
    return result


def aggregate_monthly(datasets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[str, dict[str, Any]] = {}

    for dataset in datasets:
        for row in dataset["monthly"]:
            bucket = buckets.setdefault(
                row["month"],
                {
                    "month": row["month"],
                    "label": row["label"],
                    "views": 0,
                    "sessions": 0,
                    "visitors": 0,
                    "leads": 0,
                    "shareSum": [0.0, 0.0],
                    "shareWeight": 0,
                },
            )
            bucket["views"] += row["views"]
            bucket["sessions"] += row["sessions"]
            bucket["visitors"] += row["visitors"]
            bucket["leads"] += row["leads"]
            bucket["shareSum"][0] += row["share"][0] * row["sessions"]
            bucket["shareSum"][1] += row["share"][1] * row["sessions"]
            bucket["shareWeight"] += row["sessions"]

    monthly = []
    for month in sorted(buckets):
        bucket = buckets[month]
        share_weight = bucket["shareWeight"] or 1
        sessions = bucket["sessions"] or 1
        monthly.append(
            {
                "month": month,
                "label": bucket["label"],
                "views": bucket["views"],
                "sessions": bucket["sessions"],
                "visitors": bucket["visitors"],
                "leads": bucket["leads"],
                "conversion": round(bucket["leads"] / sessions * 100, 2),
                "share": [
                    round(bucket["shareSum"][0] / share_weight, 2),
                    round(bucket["shareSum"][1] / share_weight, 2),
                ],
            }
        )

    return monthly


def aggregate_pages(datasets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[str, dict[str, Any]] = {}

    for dataset in datasets:
        site = dataset["project"]["site"]
        for page in dataset["pages"]:
            key = page["path"]
            bucket = buckets.setdefault(
                key,
                {
                    "title": page["title"],
                    "url": key,
                    "path": key,
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


def aggregate_products(datasets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[str, dict[str, Any]] = {}

    for dataset in datasets:
        site = dataset["project"]["site"]
        for product in dataset["products"]:
            key = product["name"].strip().lower()
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


def aggregate_events(datasets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[str, dict[str, Any]] = {}

    for dataset in datasets:
        site = dataset["project"]["site"]
        for event in dataset["events"]:
            key = f"{event['type']}::{event['label'].strip().lower()}"
            bucket = buckets.setdefault(
                key,
                {
                    "type": event["type"],
                    "label": event["label"],
                    "id": event["id"],
                    "sites": set(),
                    "sessions": 0,
                    "count": 0,
                },
            )
            bucket["sites"].add(site)
            bucket["sessions"] += event["sessions"]
            bucket["count"] += event["count"]

    events = []
    for bucket in buckets.values():
        events.append(
            {
                "type": bucket["type"],
                "label": bucket["label"],
                "id": bucket["id"],
                "sites": sorted(bucket["sites"]),
                "sessions": bucket["sessions"],
                "count": bucket["count"],
            }
        )

    events.sort(key=lambda item: item["count"], reverse=True)
    return events


def aggregate_utm(datasets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[str, dict[str, Any]] = {}

    for dataset in datasets:
        for utm in dataset["utm"]:
            key = utm["name"].strip().lower()
            bucket = buckets.setdefault(
                key,
                {
                    "name": utm["name"],
                    "sessions": 0,
                    "leads": 0,
                },
            )
            bucket["sessions"] += utm["sessions"]
            bucket["leads"] += utm["leads"]

    utm_rows = []
    for bucket in buckets.values():
        sessions = bucket["sessions"] or 1
        utm_rows.append(
            {
                "name": bucket["name"],
                "sessions": bucket["sessions"],
                "leads": bucket["leads"],
                "conversion": round(bucket["leads"] / sessions * 100, 2),
            }
        )

    utm_rows.sort(key=lambda item: item["sessions"], reverse=True)
    return utm_rows


def aggregate_summary(datasets: list[dict[str, Any]]) -> dict[str, Any]:
    current_sessions = sum(dataset["summary"]["sessions"]["value"] for dataset in datasets)
    current_leads = sum(dataset["summary"]["leads"]["value"] for dataset in datasets)
    current_views = sum(dataset["summary"]["views"] for dataset in datasets)
    current_visitors = sum(dataset["summary"]["visitors"] for dataset in datasets)

    previous_sessions = sum(
        previous_value(dataset["summary"]["sessions"]["value"], dataset["summary"]["sessions"]["delta"])
        for dataset in datasets
    )
    previous_leads = sum(
        previous_value(dataset["summary"]["leads"]["value"], dataset["summary"]["leads"]["delta"])
        for dataset in datasets
    )

    current_conversion = (current_leads / current_sessions * 100) if current_sessions else 0
    previous_conversion = (previous_leads / previous_sessions * 100) if previous_sessions else 0

    device_counts: dict[str, float] = {}
    for dataset in datasets:
        sessions = dataset["summary"]["sessions"]["value"]
        for device in dataset["summary"]["devices"]:
            device_counts[device["label"]] = device_counts.get(device["label"], 0) + sessions * device["share"] / 100

    devices = [
        {
            "label": label,
            "share": round(count / current_sessions * 100, 2) if current_sessions else 0,
            "delta": 0.0,
        }
        for label, count in device_counts.items()
    ]
    devices.sort(key=lambda item: item["share"], reverse=True)

    returning_new = [0.0, 0.0]
    for dataset in datasets:
        weight = dataset["summary"]["sessions"]["value"]
        returning_new[0] += dataset["summary"]["returningVsNew"][0] * weight
        returning_new[1] += dataset["summary"]["returningVsNew"][1] * weight

    divisor = current_sessions or 1

    return {
        "sessions": {
            "value": current_sessions,
            "delta": round((current_sessions - previous_sessions) / previous_sessions * 100, 2)
            if previous_sessions
            else 0.0,
        },
        "leads": {
            "value": current_leads,
            "delta": round((current_leads - previous_leads) / previous_leads * 100, 2)
            if previous_leads
            else 0.0,
        },
        "conversion": {
            "value": round(current_conversion, 2),
            "delta": round(current_conversion - previous_conversion, 2),
        },
        "devices": devices,
        "views": current_views,
        "visitors": current_visitors,
        "returningVsNew": [round(returning_new[0] / divisor, 2), round(returning_new[1] / divisor, 2)],
    }


def aggregate_sources(datasets: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "groups": merge_count_items(
            [item for dataset in datasets for item in dataset["sources"]["groups"]],
        ),
        "search": merge_count_items(
            [item for dataset in datasets for item in dataset["sources"]["search"]],
        ),
        "referrers": merge_count_items(
            [item for dataset in datasets for item in dataset["sources"]["referrers"]],
        ),
        "social": merge_count_items(
            [item for dataset in datasets for item in dataset["sources"]["social"]],
        ),
        "ads": merge_count_items(
            [item for dataset in datasets for item in dataset["sources"]["ads"]],
        ),
        "email": merge_count_items(
            [item for dataset in datasets for item in dataset["sources"]["email"]],
        ),
    }


def aggregate_geo(datasets: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "countries": merge_count_items(
            [item for dataset in datasets for item in dataset["geo"]["countries"]],
        ),
        "cities": merge_count_items(
            [item for dataset in datasets for item in dataset["geo"]["cities"]],
        ),
    }


def build_combined_dataset() -> dict[str, Any]:
    datasets = [build_dataset(path) for path in INPUTS]
    ranges = {dataset["project"]["range"] for dataset in datasets}

    return {
        "project": {
            "title": "Общая статистика RVZ",
            "site": "rvz-zavod.ru + promo.rvz-zavod.ru",
            "range": ranges.pop() if len(ranges) == 1 else "Несколько периодов",
            "sites": [
                {
                    "site": dataset["project"]["site"],
                    "title": dataset["project"]["title"],
                    "sessions": dataset["summary"]["sessions"]["value"],
                    "views": dataset["summary"]["views"],
                    "visitors": dataset["summary"]["visitors"],
                    "leads": dataset["summary"]["leads"]["value"],
                }
                for dataset in datasets
            ],
        },
        "summary": aggregate_summary(datasets),
        "monthly": aggregate_monthly(datasets),
        "pages": aggregate_pages(datasets),
        "products": aggregate_products(datasets),
        "utm": aggregate_utm(datasets),
        "events": aggregate_events(datasets),
        "sources": aggregate_sources(datasets),
        "geo": aggregate_geo(datasets),
    }


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    dataset = build_combined_dataset()
    serialized = json.dumps(dataset, ensure_ascii=False, indent=2)
    OUTPUT.write_text(serialized, encoding="utf-8")
    OUTPUT.with_suffix(".js").write_text(f"window.TILDA_STATS_DATA = {serialized};\n", encoding="utf-8")
    print(f"Wrote {OUTPUT}")
    print(f"Wrote {OUTPUT.with_suffix('.js')}")


if __name__ == "__main__":
    main()
