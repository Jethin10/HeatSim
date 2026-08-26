from __future__ import annotations

from copy import deepcopy

from simulation.scenario import get_scenario
from simulation.simulator import PARAMS, VALID_LAND, simulate


# Resource terms are tie-breakers, not a reason to stop cooling the city early.
# Hard budget/water caps are enforced separately below.
OBJECTIVES = {
    "balanced": {"cost": 0.010, "water": 0.005, "cooling": 1.0},
    "max_cooling": {"cost": 0.0, "water": 0.0, "cooling": 1.0},
    "low_resource": {"cost": 0.050, "water": 0.040, "cooling": 1.0},
}


def _candidates(scenario_id: str):
    scenario = get_scenario(scenario_id)
    out = []
    for cell in scenario.cells:
        for kind in ("tree", "green", "water", "roof", "pavement"):
            if cell.land not in VALID_LAND[kind]:
                continue

            # Trees are kept at full spatial resolution because their exact
            # placement is the central comparison against "plant at the hottest
            # valid cells". Larger interventions are sampled more coarsely and
            # then prefiltered by their measured single-action benefit.
            if kind == "tree" or (cell.x + 2 * cell.y) % 2 == 0:
                out.append({"type": kind, "x": cell.x, "y": cell.y})
    return out


def _resources(plan: list[dict]) -> tuple[float, float]:
    return (
        sum(PARAMS[i["type"]]["cost"] for i in plan),
        sum(PARAMS[i["type"]]["water"] for i in plan),
    )


def _score(baseline_exposure: float, result: dict, budget: float, water: float, weights: dict) -> float:
    improvement = baseline_exposure - result["metrics"]["exposure_index"]
    cost_ratio = result["metrics"]["cost"] / max(1.0, budget)
    water_ratio = result["metrics"]["water_per_day"] / max(1.0, water)
    return (
        weights["cooling"] * improvement
        - weights["cost"] * baseline_exposure * cost_ratio
        - weights["water"] * baseline_exposure * water_ratio
    )


def _prefilter(
    scenario_id: str,
    candidates: list[dict],
    baseline_exposure: float,
    budget: float,
    water: float,
    weights: dict,
    keep: int = 96,
) -> list[dict]:
    """Keep promising single-action candidates before interaction search.

    This is only a latency heuristic. The retained candidates are still
    re-simulated after every accepted intervention so interactions are not
    treated as independent or additive.
    """
    ranked = []
    for candidate in candidates:
        p = PARAMS[candidate["type"]]
        if p["cost"] > budget or p["water"] > water:
            continue
        result = simulate(interventions=[candidate], scenario_id=scenario_id)
        ranked.append((_score(baseline_exposure, result, budget, water, weights), candidate))
    ranked.sort(key=lambda item: item[0], reverse=True)
    return [candidate for _, candidate in ranked[:keep]]


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
    candidates = _prefilter(
        scenario_id,
        _candidates(scenario_id),
        baseline_exposure,
        budget,
        water,
        weights,
    )
    plan: list[dict] = []
    history = []
    current_exposure = baseline_exposure

    for iteration in range(max_items):
        spent, used_water = _resources(plan)
        occupied = {(i["x"], i["y"]) for i in plan}
        best = None

        for candidate in candidates:
            if (candidate["x"], candidate["y"]) in occupied:
                continue
            p = PARAMS[candidate["type"]]
            if spent + p["cost"] > budget or used_water + p["water"] > water:
                continue

            trial = plan + [candidate]
            result = simulate(interventions=trial, scenario_id=scenario_id)
            candidate_exposure = result["metrics"]["exposure_index"]

            # Never spend resources on an action that does not improve the
            # person-weighted exposure objective in the current configuration.
            if candidate_exposure >= current_exposure - 1e-6:
                continue

            score = _score(baseline_exposure, result, budget, water, weights)
            if best is None or score > best[0]:
                best = (score, candidate, result)

        if best is None:
            break

        score, candidate, result = best
        plan.append(candidate)
        candidates.remove(candidate)
        current_exposure = result["metrics"]["exposure_index"]
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
    return {"objective": objective, "plan": plan, "result": result, "history": history}


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
        profile
        for profile in profiles
        if not any(_dominates(other, profile) for other in profiles if other is not profile)
    ]
    selected = next(profile for profile in profiles if profile["objective"] == objective)

    return {
        "scenario_id": scenario_id,
        "baseline": baseline,
        "selected": selected,
        "pareto": pareto,
        "profiles": profiles,
        "search_note": (
            "Candidate-prefiltered constrained counterfactual greedy search with interaction "
            "re-evaluation; hard resource caps enforced; not claimed as a global optimum."
        ),
    }
