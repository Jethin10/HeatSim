from __future__ import annotations

from typing import Iterable

import numpy as np

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


def _cell_baseline_temp(scenario: Scenario, idx: int) -> float:
    c = scenario.cells[idx]
    return (
        scenario.ambient_temp
        + 4.8 * c.radiation
        + 3.1 * c.storage
        + 2.2 * c.et_deficit
        + 2.0 * (1.0 - c.ventilation)
        + (0.8 if c.land == "road" else 0.0)
    )


def _base_arrays(scenario: Scenario) -> dict[str, np.ndarray]:
    h, w = scenario.height, scenario.width
    arrays = {
        "temperature": np.zeros((h, w), dtype=np.float64),
        "radiation": np.zeros((h, w), dtype=np.float64),
        "storage": np.zeros((h, w), dtype=np.float64),
        "et_deficit": np.zeros((h, w), dtype=np.float64),
        "ventilation": np.zeros((h, w), dtype=np.float64),
        "activity": np.zeros((h, w), dtype=np.float64),
    }
    for c in scenario.cells:
        arrays["temperature"][c.y, c.x] = _cell_baseline_temp(scenario, _index(c.x, c.y, w))
        arrays["radiation"][c.y, c.x] = c.radiation
        arrays["storage"][c.y, c.x] = c.storage
        arrays["et_deficit"][c.y, c.x] = c.et_deficit
        arrays["ventilation"][c.y, c.x] = c.ventilation
        arrays["activity"][c.y, c.x] = c.activity
    return arrays


def baseline_layers(scenario: Scenario) -> dict[str, list[list[float]]]:
    return {key: value.tolist() for key, value in _base_arrays(scenario).items()}


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


def _diffuse(grid: np.ndarray) -> np.ndarray:
    # One conservative nearest-neighbour smoothing step. Edge cells only use
    # neighbours that actually exist, avoiding wrap-around artifacts.
    h, w = grid.shape
    total = np.zeros_like(grid)
    count = np.zeros_like(grid)
    total[1:, :] += grid[:-1, :]
    count[1:, :] += 1
    total[:-1, :] += grid[1:, :]
    count[:-1, :] += 1
    total[:, 1:] += grid[:, :-1]
    count[:, 1:] += 1
    total[:, :-1] += grid[:, 1:]
    count[:, :-1] += 1
    neighbour_mean = total / np.maximum(count, 1)
    return 0.86 * grid + 0.14 * neighbour_mean


def _exposure(scenario: Scenario, temperature: np.ndarray, humidity_delta: np.ndarray, activity: np.ndarray) -> np.ndarray:
    heat_stress = np.maximum(0.0, temperature - 35.0)
    humidity_penalty = 1.0 + 0.28 * np.maximum(0.0, humidity_delta)
    return heat_stress * (0.20 + 0.80 * activity) * humidity_penalty


def _mechanism_fingerprint(layers: dict[str, np.ndarray | list[list[float]]], x: int, y: int) -> dict[str, float | str]:
    def at(name: str) -> float:
        value = layers[name]
        return float(value[y][x])

    components = {
        "radiation": at("radiation"),
        "heat_storage": at("storage"),
        "et_deficit": at("et_deficit"),
        "ventilation_restriction": 1.0 - at("ventilation"),
    }
    dominant = sorted(components.items(), key=lambda p: p[1], reverse=True)[:2]
    return {
        **{k: round(v, 4) for k, v in components.items()},
        "dominant": " + ".join(k.replace("_", " ").title() for k, _ in dominant),
    }


def simulate(
    size: int | None = None,
    interventions: Iterable[dict] | None = None,
    scenario_id: str = "demo-block-a",
) -> dict:
    # `size` is retained for backwards compatibility with the first prototype.
    scenario = get_scenario(scenario_id)
    raw_interventions = list(interventions or [])
    base = _base_arrays(scenario)
    h, w = scenario.height, scenario.width
    yy, xx = np.mgrid[0:h, 0:w]

    temperature = base["temperature"].copy()
    radiation = base["radiation"].copy()
    storage = base["storage"].copy()
    et_deficit = base["et_deficit"].copy()
    ventilation = base["ventilation"].copy()
    activity = base["activity"]
    humidity_delta = np.zeros((h, w), dtype=np.float64)

    total_cost = 0.0
    total_water = 0.0
    warnings: list[str] = []
    accepted: list[dict] = []
    occupied: set[tuple[int, int]] = set()

    for raw in raw_interventions:
        item = {"type": raw["type"], "x": int(raw["x"]), "y": int(raw["y"])}
        ok, warning = _validate_intervention(scenario, item)
        if not ok:
            warnings.append(warning or "Invalid intervention")
            continue
        cell_key = (item["x"], item["y"])
        if cell_key in occupied:
            warnings.append(f"Cell ({item['x']},{item['y']}) already contains an intervention")
            continue
        occupied.add(cell_key)

        kind = item["type"]
        p = PARAMS[kind]
        total_cost += p["cost"]
        total_water += p["water"]
        accepted.append(item)
        source = scenario.cells[_index(item["x"], item["y"], w)]

        distance = np.hypot(xx - item["x"], yy - item["y"])
        influence = np.exp(-np.square(distance / max(float(p["radius"]), 0.01)))

        if kind in ("tree", "green"):
            shade = float(p["shade"]) * influence
            et = float(p["et"]) * influence
            radiation = np.maximum(0.05, radiation - shade)
            et_deficit = np.maximum(0.02, et_deficit - et)
            temperature -= 2.15 * shade + 1.55 * et

            if source.ventilation > 0.68:
                downwind = (xx >= item["x"]).astype(np.float64)
                lateral = np.maximum(0.0, 1.0 - np.abs(yy - item["y"]) / 3.0)
                wake = influence * downwind * lateral
                ventilation = np.maximum(0.05, ventilation - 0.07 * wake)
                temperature += 0.28 * wake

        elif kind == "water":
            evap = float(p["evap"]) * influence
            temperature -= 1.95 * evap
            humidity_delta += float(p["humidity"]) * influence
            et_deficit = np.maximum(0.02, et_deficit - 0.22 * influence)

        elif kind == "roof":
            local = (distance <= 1.6).astype(np.float64)
            gain = float(p["albedo_gain"]) * influence * local
            radiation = np.maximum(0.04, radiation - 0.62 * gain)
            storage = np.maximum(0.05, storage - 0.40 * gain)
            temperature -= 2.65 * gain

        elif kind == "pavement":
            gain = float(p["albedo_gain"]) * influence
            radiation = np.maximum(0.04, radiation - 0.38 * gain)
            storage = np.maximum(0.05, storage - 0.31 * gain)
            temperature -= 1.65 * gain

    # Apply the same diffusion operator to both reference and intervention states
    # so a zero-intervention run is exactly a 0% reduction baseline.
    baseline_temperature = _diffuse(base["temperature"])
    temperature = _diffuse(temperature)
    baseline_exposure = _exposure(scenario, baseline_temperature, np.zeros((h, w)), activity)
    exposure = _exposure(scenario, temperature, humidity_delta, activity)

    baseline_exposure_value = float(baseline_exposure.sum())
    exposure_value = float(exposure.sum())
    exposure_reduction = 0.0 if baseline_exposure_value == 0 else 100.0 * (baseline_exposure_value - exposure_value) / baseline_exposure_value

    current_layers_np = {
        "temperature": temperature,
        "radiation": radiation,
        "storage": storage,
        "et_deficit": et_deficit,
        "ventilation": ventilation,
        "activity": activity,
        "exposure": exposure,
    }
    metrics = {
        "avg_surface_temperature": round(float(temperature.mean()), 3),
        "peak_surface_temperature": round(float(temperature.max()), 3),
        "exposure_index": round(exposure_value, 3),
        "exposure_reduction_pct": round(exposure_reduction, 3),
        "cost": round(total_cost, 2),
        "water_per_day": round(total_water, 2),
        "accepted_interventions": len(accepted),
    }

    explanations = []
    for item in accepted:
        fp = _mechanism_fingerprint(current_layers_np, item["x"], item["y"])
        land = scenario.cells[_index(item["x"], item["y"], w)].land
        explanations.append(
            {
                **item,
                "fingerprint": fp,
                "reason": f"Targets {fp['dominant']} at a valid {land} cell.",
            }
        )

    layers = {key: value.tolist() for key, value in current_layers_np.items()}
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
        "layers": layers,
        "temperature_grid": layers["temperature"],
        "exposure_grid": layers["exposure"],
        "metrics": metrics,
        "warnings": warnings,
        "explanations": explanations,
    }


def fingerprint(x: int, y: int, scenario_id: str = "demo-block-a") -> dict:
    scenario = get_scenario(scenario_id)
    if not (0 <= x < scenario.width and 0 <= y < scenario.height):
        raise ValueError("Cell outside scenario bounds")
    return _mechanism_fingerprint(_base_arrays(scenario), x, y)
