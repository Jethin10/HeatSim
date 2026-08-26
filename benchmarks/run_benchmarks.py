from __future__ import annotations

import json
import random
from pathlib import Path

from optimizer.search import optimize
from simulation.scenario import get_scenario
from simulation.simulator import PARAMS, VALID_LAND, simulate

BUDGET = 1_200_000
WATER = 3_000
MAX_ITEMS = 8


def resources(plan):
    return (
        sum(PARAMS[x["type"]]["cost"] for x in plan),
        sum(PARAMS[x["type"]]["water"] for x in plan),
    )


def valid_cells(kind):
    s = get_scenario()
    return [(c.x, c.y) for c in s.cells if c.land in VALID_LAND[kind]]


def random_plan(seed=7):
    rng = random.Random(seed)
    cells = valid_cells("tree")[:]
    rng.shuffle(cells)
    plan = []
    for x, y in cells:
        candidate = plan + [{"type": "tree", "x": x, "y": y}]
        cost, water = resources(candidate)
        if cost <= BUDGET and water <= WATER:
            plan = candidate
        if len(plan) >= MAX_ITEMS:
            break
    return plan


def hotspot_plan():
    s = get_scenario()
    base = simulate(interventions=[])
    values = []
    for c in s.cells:
        if c.land in VALID_LAND["tree"]:
            values.append((base["layers"]["temperature"][c.y][c.x], c.x, c.y))
    values.sort(reverse=True)
    plan = []
    for _, x, y in values:
        candidate = plan + [{"type": "tree", "x": x, "y": y}]
        cost, water = resources(candidate)
        if cost <= BUDGET and water <= WATER:
            plan = candidate
        if len(plan) >= MAX_ITEMS:
            break
    return plan


def summarize(name, result):
    m = result["metrics"]
    return {
        "strategy": name,
        "exposure_index": m["exposure_index"],
        "exposure_reduction_pct": m["exposure_reduction_pct"],
        "avg_surface_temperature": m["avg_surface_temperature"],
        "peak_surface_temperature": m["peak_surface_temperature"],
        "cost": m["cost"],
        "water_per_day": m["water_per_day"],
        "interventions": m["accepted_interventions"],
    }


def main():
    baseline = simulate(interventions=[])
    random_result = simulate(interventions=random_plan())
    hotspot_result = simulate(interventions=hotspot_plan())
    optimized = optimize(budget=BUDGET, water=WATER, max_items=MAX_ITEMS, objective="balanced")
    heatrx_result = optimized["selected"]["result"]

    rows = [
        summarize("baseline", baseline),
        summarize("random_tree_placement", random_result),
        summarize("hottest_valid_cell", hotspot_result),
        summarize("heatrx_balanced_search", heatrx_result),
    ]
    payload = {
        "model_status": "reduced-order demonstration model; not calibrated for real-world claims",
        "constraints": {"budget": BUDGET, "water_per_day": WATER, "max_items": MAX_ITEMS},
        "results": rows,
    }
    output = Path(__file__).with_name("latest.json")
    output.write_text(json.dumps(payload, indent=2))
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
