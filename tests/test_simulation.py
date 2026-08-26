from optimizer.search import optimize
from simulation.scenario import get_scenario
from simulation.simulator import fingerprint, simulate


def test_tree_reduces_exposure_on_valid_open_cell():
    base = simulate(interventions=[])
    changed = simulate(interventions=[{"type": "tree", "x": 10, "y": 6}])
    assert changed["metrics"]["accepted_interventions"] == 1
    assert changed["metrics"]["exposure_index"] < base["metrics"]["exposure_index"]
    assert changed["metrics"]["water_per_day"] == 220


def test_cool_roof_is_accounted_on_building():
    changed = simulate(interventions=[{"type": "roof", "x": 3, "y": 3}])
    assert changed["metrics"]["accepted_interventions"] == 1
    assert changed["metrics"]["cost"] == 200_000


def test_invalid_land_is_rejected_instead_of_silently_simulated():
    changed = simulate(interventions=[{"type": "water", "x": 3, "y": 3}])
    assert changed["metrics"]["accepted_interventions"] == 0
    assert changed["metrics"]["cost"] == 0
    assert changed["warnings"]


def test_fingerprint_has_mechanism_attribution():
    fp = fingerprint(10, 6)
    assert 0 <= fp["radiation"] <= 1
    assert 0 <= fp["heat_storage"] <= 1
    assert "dominant" in fp


def test_demo_scenario_has_mixed_land_types():
    scenario = get_scenario()
    lands = {c.land for c in scenario.cells}
    assert {"building", "road", "open", "vegetation"}.issubset(lands)


def test_optimizer_respects_resources_and_improves_exposure():
    answer = optimize(budget=800_000, water=2_000, max_items=5, objective="balanced")
    base = answer["baseline"]["metrics"]
    result = answer["selected"]["result"]["metrics"]
    assert result["cost"] <= 800_000
    assert result["water_per_day"] <= 2_000
    assert result["exposure_index"] <= base["exposure_index"]
