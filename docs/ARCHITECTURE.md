# HeatRx Architecture

## Product contract

The renderer never owns the science. It receives city state, lets a user propose interventions, and animates state transitions. The simulation engine owns intervention effects. This allows the reduced-order model to later be replaced by calibrated physics/surrogate models without rewriting the game.

## Core loop

1. Observe: render city and environmental layers.
2. Diagnose: expose a per-cell thermal fingerprint.
3. Intervene: user places tree, water, cool roof or cool pavement.
4. Simulate: compute a new spatial state.
5. Optimize: search feasible intervention portfolios under constraints.
6. Explain: expose why placements were chosen and their trade-offs.

## Runtime

Web client → preview/state → FastAPI → simulation → optimizer → result grids → animated web client.

## Model roadmap

The first engine is deliberately a transparent reduced-order spatial model, not CFD and not a claimed PINN. Each intervention has a spatial response kernel and resource cost. This is the baseline required for end-to-end validation.

Next versions add radiation, heat storage, evapotranspiration, ventilation, population-weighted exposure, calibrated intervention parameters, uncertainty, and a fast learned surrogate.

## Primary objective

Minimize person-weighted thermal exposure rather than average surface temperature, subject to budget, water, land, and placement constraints.

## Optimization roadmap

v0: greedy constrained baseline.
v1: compare random vs hottest-cell vs greedy.
v2: multi-objective evolutionary search (NSGA-II) and Pareto plans.
v3: uncertainty-aware robust optimization.
