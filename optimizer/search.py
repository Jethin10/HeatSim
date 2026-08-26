from __future__ import annotations

from copy import deepcopy

from simulation.scenario import get_scenario
from simulation.simulator import PARAMS, VALID_LAND, simulate


OBJECTIVES = {
    "balanced": {"cost": 0.20, "water": 0.18, "cooling": 1.0},
    "max_cooling": {"cost": 0.04, "water": 0.04, "cooling": 1.0},
    "low_resource": {"cost": 0.48, "water": 0.40, "cooling": 1.0},
}


def _candidates(scenario_id: str):
    scenario = get_scenario(scenario_id)
    out = []
    for cell in scenario.cells:
        for kind in ("tree", "green", "water", "roof", "pavement"):
            if cell.land in VALID_LAND[kind]:
                # Keep the search compact enough for a live hackathon demo.
                stride_ok = ((cell.x + 2 * cell.y) % (2 if kind in ("tree", "roof", "pavement") else 3)) == 0
                if stride_ok:
                    out.append({"type": kind, "x": cell.x, "y": cell.y})
    return out


def _resources(plan: list[dict]) -> tuple[float, float]:
    return (
        sum(PARAMS[i["type"]]["cost"] for i in plan),
        sum(PARAMS[i["type"]]["water"] for i in plan),
    )


def _score(
    baseline_exposure: float,
    result: dict,
    budget: float,
    water: float,
    weights: dict,
) -> float:
    improvement = baseline_exposure - result["metrics"]["exposure_index"]
    cost_ratio = result["metrics"]["cost"] / max(1.0, budget)
    water_ratio = result["metrics"]["water_per_day"] / max(1.0, water)
    return (
        weights["cooling"] * improvement
        - weights["cost"] * baseline_exposure * cost_ratio
        - weights["water"] * baseline_exposure * water_ratio
    )


def _greedy_profile(
    scenario_id: str,
    budget: float,
    water: float,
    max_items: int,
    objective: str,
) -> dict:
    weights = OBJECTIVES[objective]
    baseline = simulate(interventions=[], scenario_id=scenario_id)
    baseline_exposure = baseline["metrics"]["exposure_index"]
    candidates = _candidates(scenario_id)
    plan: list[dict] = []
    history = []

    for iteration in range(max_items):
        spent, used_water = _resources(plan)
        best = None
        # Re-evaluate marginal effects after each accepted intervention so the
        # optimizer captures interaction rather than adding independent scores.
        for candidate in candidates:
            p = PARAMS[candidate["type"]]
            if spent + p["cost"] > budget or used_water + p["water"] > water:
                continue
            trial = plan + [candidate]
            result = simulate(interventions=trial, scenario_id=scenario_id)
            score = _score(baseline_exposure, result, budget, water, weights)
            if best is None or score > best[0]:
                best = (score, candidate, result)

        if best is None:
            break
        score, candidate, result = best
        if history and score <= history[-1]["score"] + 1e-6:
            break
        plan.append(candidate)
        candidates.remove(candidate)
        history.append(
            {
                "iteration": iteration + 1,
                "score": round(score, 4),
                "exposure_reduction_pct": result["metrics"]["exposure_reduction_pct"],
                "cost": result["metrics"]["cost"],
                "water_per_day": result["metrics"]["water_per_day"],
                "best_action": deepcopy(candidate),
            }
        )

    result = simulate(interventions=plan, scenario_id=scenario_id)
    return {
        "objective": objective,
        "plan": plan,
        "result": result,
        "history": history,
    }


def _dominates(a: dict, b: dict) -> bool:
    am, bm = a["result"]["metrics"], b["result"]["metrics"]
    no_worse = (
        am["exposure_index"] <= bm["exposure_index"]
        and am["cost"] <= bm["cost"]
        and am["water_per_day"] <= bm["water_per_day"]
    )
    strictly_better = (
        am["exposure_index"] < bm["exposure_index"]
        or am["cost"] < bm["cost"]
        or am["water_per_day"] < bm["water_per_day"]
    )
    return no_worse and strictly_better


def optimize(
    size: int | None = None,
    budget: float = 3_000_000,
    water: float = 8_000,
    scenario_id: str = "demo-block-a",
    max_items: int = 14,
    objective: str = "balanced",
):
    if objective not in OBJECTIVES:
        raise ValueError(f"Unknown objective: {objective}")

    baseline = simulate(interventions=[], scenario_id=scenario_id)
    profiles = [
        _greedy_profile(scenario_id, budget, water, max_items, name)
        for name in ("max_cooling", "balanced", "low_resource")
    ]
    pareto = [
        p for p in profiles
        if not any(_dominates(other, p) for other in profiles if other is not p)
    ]
    selected = next(p for p in profiles if p["objective"] == objective)

    return {
        "scenario_id": scenario_id,
        "baseline": baseline,
        "selected": selected,
        "pareto": pareto,
        "profiles": profiles,
        "search_note": "Constrained counterfactual greedy search with interaction re-evaluation; not claimed as global optimum.",
    }
