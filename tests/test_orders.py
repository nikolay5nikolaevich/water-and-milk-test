"""Сверка JS-расчёта (node cli.js --json) с эталоном на Python.

Запуск из корня проекта: python -m unittest discover tests -v
"""
import json
import random
import subprocess
import tempfile
import unittest
from pathlib import Path

import reference

ROOT = Path(__file__).resolve().parent.parent


def run_js(path):
    out = subprocess.run(["node", str(ROOT / "cli.js"), str(path), "--json"],
                         capture_output=True, text=True, encoding="utf-8", cwd=ROOT)
    return json.loads(out.stdout)


def write_csv(text):
    f = tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, encoding="utf-8")
    f.write(text)
    f.close()
    return Path(f.name)


class SampleFile(unittest.TestCase):
    def test_expected_orders(self):
        js = {r["sku"]: r for r in run_js(ROOT / "data/products.csv")["rows"]}
        expected = {"A001": (56, 12, 44), "A002": (43, 70, 0), "A003": (34, 13, 21),
                    "A004": (65, 100, 0), "A005": (0, 0, 0), "A006": (14, 0, 14)}
        for sku, (target, available, order) in expected.items():
            r = js[sku]
            self.assertEqual((r["target"], r["available"], r["order"]), (target, available, order), sku)


class EdgeCases(unittest.TestCase):
    def check(self, row, order):
        path = write_csv(",".join(reference.FIELDS) + "\n" + row + "\n")
        self.assertEqual(run_js(path)["rows"][0]["order"], order)
        products, _ = reference.load(path)
        self.assertEqual(reference.calc_order(products[0])["order"], order)

    def test_nothing_to_order(self):
        self.check("X,a,100,1,0,3,0", 0)

    def test_zero_sales(self):
        self.check("X,a,0,0,0,5,3", 3)

    def test_incoming_counts(self):
        self.check("X,a,2,1,5,3,0", 3)  # 10 - (2 + 5)

    def test_float_rounding(self):
        # 0.1 × 30 = 3.0000000000000004 в float; правильный целевой запас 3, а не 4
        self.check("X,a,0,0.1,0,23,0", 3)

    def test_fraction_rounds_up(self):
        self.check("X,a,0,0.35,0,3,0", 4)  # 3.5 → 4


class Validation(unittest.TestCase):
    def test_invalid_rows_reported_and_skipped(self):
        js = run_js(ROOT / "data/invalid.csv")
        products, errors = reference.load(ROOT / "data/invalid.csv")
        self.assertEqual([r["sku"] for r in js["rows"]], [p["sku"] for p in products])
        self.assertEqual([e["line"] for e in js["errors"]], [e[0] for e in errors])

    def test_semicolon_and_decimal_comma(self):
        path = write_csv("sku;name;stock;daily_sales;incoming;lead_days;safety_stock\nX;a;0;1,5;0;1;2\n")
        self.assertEqual(run_js(path)["rows"][0]["order"], 14)


class RandomCrossCheck(unittest.TestCase):
    def test_js_matches_reference(self):
        rnd = random.Random(42)
        lines = [",".join(reference.FIELDS)]
        for i in range(2000):
            sales = rnd.choice([str(rnd.randint(0, 50)), f"{rnd.randint(0, 50)}.{rnd.randint(0, 99):02d}",
                                f"0.{rnd.randint(1, 9)}"])
            lines.append(f"S{i},n,{rnd.randint(0, 500)},{sales},{rnd.randint(0, 200)},"
                         f"{rnd.randint(0, 60)},{rnd.randint(0, 50)}")
        path = write_csv("\n".join(lines))
        js = run_js(path)["rows"]
        ref = [reference.calc_order(p) for p in reference.load(path)[0]]
        self.assertEqual(len(js), len(ref))
        for a, b in zip(js, ref):
            self.assertEqual((a["target"], a["available"], a["order"]),
                             (b["target"], b["available"], b["order"]), a["sku"])


if __name__ == "__main__":
    unittest.main()
