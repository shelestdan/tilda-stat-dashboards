from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup, Tag


MONTHS = {
    "январь": 1,
    "февраль": 2,
    "март": 3,
    "апрель": 4,
    "май": 5,
    "июнь": 6,
    "июль": 7,
    "август": 8,
    "сентябрь": 9,
    "октябрь": 10,
    "ноябрь": 11,
    "декабрь": 12,
}


def read_html(path: Path) -> BeautifulSoup:
    return BeautifulSoup(path.read_text(encoding="utf-8"), "lxml")


def clean_text(node: Tag | None) -> str:
    if node is None:
        return ""
    return " ".join(node.get_text(" ", strip=True).split())


def parse_int(value: str) -> int:
    digits = re.sub(r"[^\d]", "", value)
    return int(digits) if digits else 0


def parse_float(value: str) -> float:
    normalized = value.replace("%", "").replace(",", ".").strip()
    return float(normalized) if normalized else 0.0


def split_label_and_trailing_count(value: str) -> tuple[str, int]:
    cleaned = value.strip()
    match = re.match(r"^(.*?)(?:\s+(\d+))?$", cleaned)
    if not match:
        return cleaned, 0

    label = (match.group(1) or "").strip()
    count = int(match.group(2)) if match.group(2) else 0
    return label or cleaned, count


def parse_delta(node: Tag | None) -> float:
    if node is None:
        return 0.0
    value = parse_float(clean_text(node))
    classes = node.get("class", [])
    if any("down" in class_name for class_name in classes):
        return -value
    return value


def parse_share_pair(value: str) -> list[float]:
    parts = [parse_float(part) for part in value.split("/")]
    return parts if len(parts) == 2 else [0.0, 0.0]


def month_label_to_iso(label: str) -> str:
    match = re.match(r"([А-Яа-я]+)\s+(\d{4})", label)
    if not match:
        raise ValueError(f"Unexpected month label: {label}")

    month_name = match.group(1).lower()
    year = int(match.group(2))
    month = MONTHS[month_name]
    return f"{year:04d}-{month:02d}"


def find_table_by_headers(soup: BeautifulSoup, headers: list[str]) -> Tag:
    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        if not rows:
            continue
        first_row = [
            " ".join(cell.get_text(" ", strip=True).split())
            for cell in rows[0].find_all(["th", "td"])
        ]
        if first_row[: len(headers)] == headers:
            return table
    raise ValueError(f"Table with headers {headers!r} not found")


def find_optional_table_by_headers(soup: BeautifulSoup, headers: list[str]) -> Tag | None:
    try:
        return find_table_by_headers(soup, headers)
    except ValueError:
        return None


def parse_summary(soup: BeautifulSoup) -> dict[str, Any]:
    sessions_card = soup.select_one("#cardSessions")
    leads_card = soup.select_one("#cardLeads")
    conversion_card = soup.select_one("#cardCnv")
    devices_rows = soup.select("#cardDevices tr")

    device_split = []
    for row in devices_rows:
        cells = row.find_all("td")
        if len(cells) < 2:
            continue
        device_split.append(
            {
                "label": clean_text(cells[0]),
                "share": parse_float(clean_text(cells[1])),
                "delta": parse_delta(cells[2] if len(cells) > 2 else None),
            }
        )

    return {
        "sessions": {
            "value": parse_int(clean_text(sessions_card.select_one(".st-card__index"))),
            "delta": parse_delta(sessions_card.select_one(".st-card__delta")),
        },
        "leads": {
            "value": parse_int(clean_text(leads_card.select_one(".st-card__index"))),
            "delta": parse_delta(leads_card.select_one(".st-card__delta")),
        },
        "conversion": {
            "value": parse_float(clean_text(conversion_card.select_one(".st-card__index"))),
            "delta": parse_delta(conversion_card.select_one(".st-card__delta")),
        },
        "devices": device_split,
    }


def parse_monthly(soup: BeautifulSoup) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    table = find_table_by_headers(
        soup,
        ["Дата", "Просмотры", "Сессии", "Посетители", "/", "Заявки", "Конверсия (%)"],
    )

    monthly: list[dict[str, Any]] = []
    totals: dict[str, Any] = {}

    for row in table.find_all("tr")[1:]:
        cells = row.find_all("td")
        if len(cells) < 7:
            continue

        label = clean_text(cells[0])
        item = {
            "label": label,
            "views": parse_int(clean_text(cells[1])),
            "sessions": parse_int(clean_text(cells[2])),
            "visitors": parse_int(clean_text(cells[3])),
            "share": parse_share_pair(clean_text(cells[4])),
            "leads": parse_int(clean_text(cells[5])),
            "conversion": parse_float(clean_text(cells[6])),
        }

        if label == "Всего":
            totals = item
        else:
            item["month"] = month_label_to_iso(label)
            monthly.append(item)

    monthly.reverse()
    return monthly, totals


def parse_pages(soup: BeautifulSoup) -> list[dict[str, Any]]:
    table = find_table_by_headers(soup, ["Страницы", "Просмотры", "Сессии", "Посетители", "/"])
    pages = []

    for row in table.find_all("tr")[1:]:
        cells = row.find_all("td")
        if len(cells) < 5:
            continue

        links = cells[0].find_all("a")
        main_link = links[0] if links else None
        url = clean_text(main_link)
        if not url:
            continue

        domain, _, raw_path = url.partition("/")
        path = f"/{raw_path}" if raw_path else "/"

        pages.append(
            {
                "title": "Главная" if path == "/" else path,
                "url": url,
                "domain": domain,
                "path": path,
                "views": parse_int(clean_text(cells[1])),
                "sessions": parse_int(clean_text(cells[2])),
                "visitors": parse_int(clean_text(cells[3])),
                "share": parse_share_pair(clean_text(cells[4])),
            }
        )

    return pages


def parse_products(soup: BeautifulSoup) -> list[dict[str, Any]]:
    table = find_table_by_headers(soup, ["Товары", "Просмотры", "Сессии", "Посетители", "/"])
    products = []

    for row in table.find_all("tr")[1:]:
        cells = row.find_all("td")
        if len(cells) < 5:
            continue

        links = cells[0].find_all("a")
        if len(links) < 2:
            continue

        name = clean_text(links[0])
        site_url = clean_text(links[1].find("span")) or clean_text(links[1])
        product_id_match = re.search(r"-(\d{12})-", site_url)

        products.append(
            {
                "name": name,
                "url": site_url,
                "productId": product_id_match.group(1) if product_id_match else None,
                "views": parse_int(clean_text(cells[1])),
                "sessions": parse_int(clean_text(cells[2])),
                "visitors": parse_int(clean_text(cells[3])),
                "share": parse_share_pair(clean_text(cells[4])),
            }
        )

    return products


def parse_utm(soup: BeautifulSoup) -> list[dict[str, Any]]:
    table = find_optional_table_by_headers(
        soup,
        ["UTM source, UTM medium, UTM campaign", "Сессии", "Конверсия (%)", "Заявки"],
    )

    if table is None:
        return []

    rows = []
    for row in table.find_all("tr")[1:]:
        cells = row.find_all("td")
        if len(cells) < 4:
            continue
        rows.append(
            {
                "name": clean_text(cells[0]),
                "sessions": parse_int(clean_text(cells[1])),
                "conversion": parse_float(clean_text(cells[2])),
                "leads": parse_int(clean_text(cells[3])),
            }
        )
    return rows


def parse_events(soup: BeautifulSoup, products: list[dict[str, Any]]) -> list[dict[str, Any]]:
    table = find_table_by_headers(soup, ["События", "ID", "Сессии", "Количество"])
    product_names = {product["productId"]: product["name"] for product in products if product["productId"]}
    events = []

    for row in table.find_all("tr")[1:]:
        cells = row.find_all("td")
        if len(cells) < 4:
            continue

        event_id = clean_text(cells[1])
        product_id_match = re.search(r"/detail/(\d{12})/", event_id)
        product_name = product_names.get(product_id_match.group(1)) if product_id_match else None

        events.append(
            {
                "type": clean_text(cells[0]),
                "id": event_id,
                "label": product_name or event_id,
                "sessions": parse_int(clean_text(cells[2])),
                "count": parse_int(clean_text(cells[3])),
            }
        )

    return events


def parse_named_share_table(rows: list[Tag]) -> list[dict[str, Any]]:
    items = []
    for row in rows:
        cells = row.find_all("td")
        if len(cells) < 2:
            continue

        left_text = clean_text(cells[0])
        label, count = split_label_and_trailing_count(left_text)

        items.append(
            {
                "label": label,
                "count": count,
                "share": parse_float(clean_text(cells[1])),
            }
        )
    return items


def parse_sources(soup: BeautifulSoup) -> dict[str, Any]:
    source_summary = []
    source_table = None
    for table in soup.find_all("table"):
        first_cell = clean_text(table.find("td"))
        if first_cell.startswith("Прямые заходы"):
            source_table = table
            break

    if source_table:
        source_summary = parse_named_share_table(source_table.find_all("tr"))

    search_rows = soup.select("#site-search-sources-body tr, #site-organic-sources-body tr")
    if not search_rows:
        search_engines = {"yandex", "google", "bing", "yahoo", "duckduckgo", "rambler"}
        for table in soup.find_all("table"):
            rows = table.find_all("tr")
            if not rows:
                continue
            first_cell = clean_text(rows[0].find("td"))
            first_word = first_cell.split(" ", 1)[0].lower()
            if first_word in search_engines:
                search_rows = rows
                break

    return {
        "groups": source_summary,
        "search": parse_named_share_table(search_rows),
        "referrers": parse_named_share_table(soup.select("#site-referrer-sources-body tr")),
        "social": parse_named_share_table(soup.select("#site-social-sources-body tr")),
        "ads": parse_named_share_table(soup.select("#site-adv-sources-body tr")),
        "email": parse_named_share_table(soup.select("#site-email-sources-body tr")),
    }


def parse_geo(soup: BeautifulSoup) -> dict[str, Any]:
    countries = []
    for row in soup.select("[id^='project-geo-left-table-body'] tr"):
        cells = row.find_all("td")
        if len(cells) < 2:
            continue
        left_text = clean_text(cells[0])
        code_match = re.search(r"\b([A-Z]{2})\b", left_text)
        countries.append(
            {
                "label": code_match.group(1) if code_match else left_text,
                "count": parse_int(left_text),
                "share": parse_float(clean_text(cells[1])),
            }
        )

    cities = []
    for row in soup.select("[id^='project-geo-right-table-body'] tr"):
        cells = row.find_all("td")
        if len(cells) < 2:
            continue
        left_text = clean_text(cells[0])
        label, count = split_label_and_trailing_count(left_text)
        cities.append(
            {
                "label": label,
                "count": count,
                "share": parse_float(clean_text(cells[1])),
            }
        )

    return {"countries": countries, "cities": cities}


def build_dataset(html_path: Path) -> dict[str, Any]:
    soup = read_html(html_path)
    summary = parse_summary(soup)
    monthly, totals = parse_monthly(soup)
    products = parse_products(soup)

    return {
        "project": {
            "title": clean_text(soup.title),
            "site": clean_text(soup.select_one(".st-site-link a")),
            "range": clean_text(soup.select_one(".st-interval__from-to-lbl")).replace(" - ", " — "),
        },
        "summary": {
            **summary,
            "views": totals.get("views", 0),
            "visitors": totals.get("visitors", 0),
            "returningVsNew": totals.get("share", [0.0, 0.0]),
        },
        "monthly": monthly,
        "pages": parse_pages(soup),
        "products": products,
        "utm": parse_utm(soup),
        "events": parse_events(soup, products),
        "sources": parse_sources(soup),
        "geo": parse_geo(soup),
    }


def main() -> None:
    html_path = Path(
        sys.argv[1]
        if len(sys.argv) > 1
        else "/Users/kristinakarpova/Downloads/Статистика сайта - РВЗ Северная... - Tilda.html"
    )
    output_path = Path(
        sys.argv[2]
        if len(sys.argv) > 2
        else "/Users/kristinakarpova/statistic/data/site-stats.json"
    )
    js_output_path = output_path.with_suffix(".js")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    dataset = build_dataset(html_path)
    serialized = json.dumps(dataset, ensure_ascii=False, indent=2)
    output_path.write_text(serialized, encoding="utf-8")
    js_output_path.write_text(
        f"window.TILDA_STATS_DATA = {serialized};\n",
        encoding="utf-8",
    )
    print(f"Wrote {output_path}")
    print(f"Wrote {js_output_path}")


if __name__ == "__main__":
    main()
