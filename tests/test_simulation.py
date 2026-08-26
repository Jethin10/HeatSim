from simulation.simulator import simulate


def test_tree_reduces_exposure():
    base = simulate(18, [])
    changed = simulate(18, [{"type":"tree","x":10,"y":8}])
    assert changed["metrics"]["exposure_index"] < base["metrics"]["exposure_index"]


def test_intervention_cost_is_accounted():
    changed = simulate(18, [{"type":"roof","x":10,"y":8}])
    assert changed["metrics"]["cost"] == 200000
