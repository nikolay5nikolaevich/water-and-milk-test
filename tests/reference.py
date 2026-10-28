"""Независимая эталонная реализация на Python: проверка входного CSV и расчёт заказа.

Считает через Decimal, чтобы не зависеть от погрешностей float.
Запуск как проверка файла: python tests/reference.py data/products.csv
"""
import csv
import math
import sys
from decimal import Decimal, InvalidOperation

FIELDS = ["sku", "name", "stock", "daily_sales", "incoming", "lead_days", "safety_stock"]
INT_FIELDS = ["stock", "incoming", "lead_days", "safety_stock"]
COVER_DAYS = 7


def parse_int(value):
    if not value.isdigit():
        raise ValueError(f"нужно целое число ≥ 0, получено «{value}»")
    return int(value)


def parse_sales(value):
    try:
        d = Decimal(value.replace(",", "."))
    except InvalidOperation:
        raise ValueError(f"нужно число ≥ 0, получено «{value}»")
    if not d.is_finite() or d < 0:
        raise ValueError(f"нужно число ≥ 0, получено «{value}»")
    return d


def load(path):
    """Возвращает (products, errors). errors: список (номер_строки, sku, текст)."""
    with open(path, encoding="utf-8-sig", newline="") as f:
        text = f.read()
    sep = ";" if ";" in text.splitlines()[0] else ","
    reader = csv.reader(text.splitlines(), delimiter=sep)
    header = [h.strip().lower() for h in next(reader)]
    missing = [f for f in FIELDS if f not in header]
    if missing:
        return [], [(1, "", f"нет столбцов: {missing}")]

    products, errors, seen = [], [], set()
    for line_no, cells in enumerate(reader, start=2):
        if not any(c.strip() for c in cells):
            continue
        if len(cells) != len(header):
            errors.append((line_no, cells[0].strip() if cells else "", "неверное число столбцов"))
            continue
        raw = {h: c.strip() for h, c in zip(header, cells)}
        try:
            if not raw["sku"] or not raw["name"]:
                raise ValueError("пустой sku или name")
            if raw["sku"] in seen:
                raise ValueError(f"повтор sku {raw['sku']}")
            p = {"sku": raw["sku"], "name": raw["name"], "daily_sales": parse_sales(raw["daily_sales"])}
            p.update({f: parse_int(raw[f]) for f in INT_FIELDS})
        except ValueError as e:
            errors.append((line_no, raw["sku"], str(e)))
            continue
        seen.add(p["sku"])
        products.append(p)
    return products, errors


def calc_order(p):
    period = p["lead_days"] + COVER_DAYS
    target = math.ceil(p["daily_sales"] * period + p["safety_stock"])
    available = p["stock"] + p["incoming"]
    return {"sku": p["sku"], "period": period, "target": target,
            "available": available, "order": max(0, target - available)}


if __name__ == "__main__":
    products, errors = load(sys.argv[1] if len(sys.argv) > 1 else "data/products.csv")
    for line_no, sku, msg in errors:
        print(f"строка {line_no} {sku}: {msg}")
    print(f"корректных строк: {len(products)}, ошибок: {len(errors)}")
    sys.exit(1 if errors else 0)
