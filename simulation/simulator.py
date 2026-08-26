from __future__ import annotations

import math
from typing import Iterable

from simulation.scenario import Scenario, get_scenario


PARAMS = {
    "tree": {"cost": 40_000, "water": 220, "radius": 3.2, "shade": 0.22, "et": 0.19},
    "green": {"cost": 90_000, "water": 420, "radius": 3.6, "shade": 0.10, "et": 0.27},
    "water": {"cost": 500_000, "water": 700, "radius": 4.4, "evap": 0.34, "humidity": 0.08},
    "roof": {"cost": 200_000, "water": 0, "radius": 1.8, "albedo_gain": 0.42},
    "pavement": {"cost": 100_000, "water": 0, "radius": 2.2, "albedo_gain": 0.28},
}

VALID_LAND = {
    "tree": {"open", "vegetation"},
    "green": {"open", "vegetation"},
    "water": {"open"},
    "roof": {"building"},
    "pavement": {"road", "open"},
}


def _index(x: int, y: int, width: int) -> int:
    return y * width + x


def _kernel(distance: float, radius: float) -> float:
    return math.exp(-((distance / max(radius, 0.01)) ** 2))


def _blank(width: int, height: int, value: float = 0.0) -> list[list[float]]:
    return [[value for _ in range(width)] for _ in range(height)]


def _flatten(grid: list[list[float]]) -> list[float]:
    return [v for row in grid for v in row]


def _cell_baseline_temp(scenario: Scenario, idx: int) -> float:
    c = scenario.cells[idx]
    # Reduced-order surface-energy proxy. Coefficients are intentionally explicit
    # and should be calibrated against measured/simulated reference data before
    # any real-world cooling claim is made.
    return (
        scenario.ambient_temp
        + 4.8 * c.radiation
        + 3.1 * c.storage
        + 2.2 * c.et_deficit
        + 2.0 * (1.0 - c.ventilation)
        + (0.8 if c.land == "road" else 0.0)
    )


def baseline_layers(scenario: Scenario) -> dict[str, list[list[float]]]:
    w, h = scenario.width, scenario.height
    temperature = _blank(w, h)
    radiation = _blank(w, h)
    storage = _blank(w, h)
    et_deficit = _blank(w, h)
    ventilation = _blank(w, h)
    activity = _blank(w, h)
    for c in scenario.cells:
        temperature[c.y][c.x] = _cell_baseline_temp(scenario, _index(c.x, c.y, w))
        radiation[c.y][c.x] = c.radiation
        storage[c.y][c.x] = c.storage
        et_deficit[c.y][c.x] = c.et_deficit
        ventilation[c.y][c.x] = c.ventilation
        activity[c.y][c.x] = c.activity
    return {
        "temperature": temperature,
        "radiation": radiation,
        "storage": storage,
        "et_deficit": et_deficit,
        "ventilation": ventilation,
        "activity": activity,
    }


def _validate_intervention(scenario: Scenario, item: dict) -> tuple[bool, str | None]:
    kind = item.get("type")
    x, y = int(item.get("x", -1)), int(item.get("y", -1))
    if kind not in PARAMS:
        return False, f"Unknown intervention type: {kind}"
    if not (0 <= x < scenario.width and 0 <= y < scenario.height):
        return False, f"{kind} is outside the scenario bounds"
    land = scenario.cells[_index(x, y, scenario.width)].land
    if land not in VALID_LAND[kind]:
        return False, f"{kind} cannot be placed on {land} at ({x},{y})"
    return True, None


def _exposure_grid(
    scenario: Scenario,
    temperature: list[list[float]],
    humidity_delta: list[list[float]],
) -> list[list[float]]:
    w, h = scenario.width, scenario.height
    out = _blank(w, h)
    for c in scenario.cells:
        # A normalized person-weighted heat-stress proxy. Activity is a proxy for
        # exposed person-hours, not a population estimate.
        heat_stress = max(0.0, temperature[c.y][c.x] - 35.0)
        humidity_penalty = 1.0 + 0.28 * max(0.0, humidity_delta[c.y][c.x])
        out[c.y][c.x] = heat_stress * (0.20 + 0.80 * c.activity) * humidity_penalty
    return out


def _mechanism_fingerprint(
    layers: dict[str, list[list[float]]], x: int, y: int
) -> dict[str, float | str]:
    components = {
        "radiation": layers["radiation"][y][x],
        "heat_storage": layers["storage"][y][x],
        "et_deficit": layers["et_deficit"][y][x],
        "ventilation_restriction": 1.0 - layers["ventilation"][y][x],
    }
    dominant = sorted(components.items(), key=lambda p: p[1], reverse=True)[:2]
    return {
        **{k: round(float(v), 4) for k, v in components.items()},
        "dominant": " + ".join(k.replace("_", " ").title() for k, _ in dominant),
    }


def simulate(
    size: int | None = None,
    interventions: Iterable[dict] | None = None,
    scenario_id: str = "demo-block-a",
) -> dict:
    # `size` remains accepted for backwards compatibility with the initial API.
    scenario = get_scenario(scenario_id)
    interventions = list(interventions or [])
    layers = baseline_layers(scenario)
    w, h = scenario.width, scenario.height

    temp = [row[:] for row in layers["temperature"]]
    radiation = [row[:] for row in layers["radiation"]]
    storage = [row[:] for row in layers["storage"]]
    et_deficit = [row[:] for row in layers["et_deficit"]]
    ventilation = [row[:] for row in layers["ventilation"]]
    humidity_delta = _blank(w, h)

    total_cost = 0.0
    total_water = 0.0
    warnings: list[str] = []
    accepted: list[dict] = []

    for raw in interventions:
        item = {"type": raw["type"], "x": int(raw["x"]), "y": int(raw["y"])}
        ok, warning = _validate_intervention(scenario, item)
        if not ok:
            warnings.append(warning or "Invalid intervention")
            continue

        kind = item["type"]
        p = PARAMS[kind]
        total_cost += p["cost"]
        total_water += p["water"]
        accepted.append(item)
        source = scenario.cells[_index(item["x"], item["y"], w)]

        for y in range(h):
            for x in range(w):
                d = math.hypot(x - item["x"], y - item["y"])
                influence = _kernel(d, p["radius"])

                if kind in ("tree", "green"):
                    shade = p["shade"] * influence
                    et = p["et"] * influence
                    radiation[y][x] = max(0.05, radiation[y][x] - shade)
                    et_deficit[y][x] = max(0.02, et_deficit[y][x] - et)
                    temp[y][x] -= 2.15 * shade + 1.55 * et

                    # Dense planting in a high-flow corridor can create an airflow
                    # penalty. The penalty is strongest directly downwind (east).
                    if source.ventilation > 0.68 and x >= item["x"]:
                        wake = influence * max(0.0, 1.0 - abs(y - item["y"]) / 3.0)
                        ventilation[y][x] = max(0.05, ventilation[y][x] - 0.07 * wake)
                        temp[y][x] += 0.28 * wake

                elif kind == "water":
                    evap = p["evap"] * influence
                    temp[y][x] -= 1.95 * evap
                    humidity_delta[y][x] += p["humidity"] * influence
                    et_deficit[y][x] = max(0.02, et_deficit[y][x] - 0.22 * influence)

                elif kind == "roof":
                    if d <= 1.6:
                        gain = p["albedo_gain"] * influence
                        radiation[y][x] = max(0.04, radiation[y][x] - 0.62 * gain)
                        storage[y][x] = max(0.05, storage[y][x] - 0.40 * gain)
                        temp[y][x] -= 2.65 * gain

                elif kind == "pavement":
                    gain = p["albedo_gain"] * influence
                    radiation[y][x] = max(0.04, radiation[y][x] - 0.38 * gain)
                    storage[y][x] = max(0.05, storage[y][x] - 0.31 * gain)
                    temp[y][x] -= 1.65 * gain

    # Diffusive neighborhood term to avoid treating cells as independent islands.
    diffused = [row[:] for row in temp]
    for y in range(h):
        for x in range(w):
            neighbors = []
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    neighbors.append(temp[ny][nx])
            if neighbors:
                diffused[y][x] = 0.86 * temp[y][x] + 0.14 * (sum(neighbors) / len(neighbors))
    temp = diffused

    current_layers = {
        "temperature": temp,
        "radiation": radiation,
        "storage": storage,
        "et_deficit": et_deficit,
        "ventilation": ventilation,
        "activity": layers["activity"],
    }
    exposure = _exposure_grid(scenario, temp, humidity_delta)
    current_layers["exposure"] = exposure

    baseline_exposure = _exposure_grid(scenario, layers["temperature"], _blank(w, h))
    base_exposure_value = sum(_flatten(baseline_exposure))
    exposure_value = sum(_flatten(exposure))
    exposure_reduction = 0.0 if base_exposure_value == 0 else 100.0 * (base_exposure_value - exposure_value) / base_exposure_value

    temps = _flatten(temp)
    metrics = {
        "avg_surface_temperature": round(sum(temps) / len(temps), 3),
        "peak_surface_temperature": round(max(temps), 3),
        "exposure_index": round(exposure_value, 3),
        "exposure_reduction_pct": round(exposure_reduction, 3),
        "cost": round(total_cost, 2),
        "water_per_day": round(total_water, 2),
        "accepted_interventions": len(accepted),
    }

    explanations = []
    for item in accepted:
        fp = _mechanism_fingerprint(current_layers, item["x"], item["y"])
        explanations.append(
            {
                **item,
                "fingerprint": fp,
                "reason": f"Targets {fp['dominant']} at a valid {scenario.cells[_index(item['x'], item['y'], w)].land} cell.",
            }
        )

    return {
        "scenario": {
            "id": scenario.id,
            "name": scenario.name,
            "width": w,
            "height": h,
            "cell_m": scenario.cell_m,
            "ambient_temp": scenario.ambient_temp,
            "wind_speed": scenario.wind_speed,
            "wind_direction_deg": scenario.wind_direction_deg,
        },
        "interventions": accepted,
        "layers": current_layers,
        "temperature_grid": temp,
        "exposure_grid": exposure,
        "metrics": metrics,
        "warnings": warnings,
        "explanations": explanations,
    }


def fingerprint(x: int, y: int, scenario_id: str = "demo-block-a") -> dict:
    scenario = get_scenario(scenario_id)
    if not (0 <= x < scenario.width and 0 <= y < scenario.height):
        raise ValueError("Cell outside scenario bounds")
    layers = baseline_layers(scenario)
    return _mechanism_fingerprint(layers, x, y)
