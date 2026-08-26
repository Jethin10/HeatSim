# HeatRx Model Notes

This document describes the current reduced-order demonstration model. It is deliberately explicit so every effect can be inspected, tested, and later calibrated.

## Spatial representation

The demo city is a 28 × 20 grid. Each cell represents 5 m × 5 m and stores:

- land type
- building height proxy
- albedo
- vegetation fraction
- activity / exposed-person proxy
- radiation load
- heat-storage factor
- evapotranspiration deficit
- ventilation potential

The current demo block is deterministic so results are reproducible.

## Baseline temperature proxy

For cell `i`, the baseline surface-temperature proxy is:

```text
T_i = T_ambient
    + 4.8 * radiation_i
    + 3.1 * storage_i
    + 2.2 * ET_deficit_i
    + 2.0 * (1 - ventilation_i)
    + road_penalty_i
```

These coefficients are demonstration coefficients, not field-calibrated constants.

## Thermal fingerprint

Each cell exposes:

```text
[radiation,
 heat storage,
 ET deficit,
 ventilation restriction]
```

The top two components become the dominant mechanism explanation.

This supports the key product principle:

> same temperature does not imply same cause, therefore it should not imply the same intervention.

## Human exposure proxy

The system optimizes a person-weighted heat-stress proxy instead of average temperature alone.

```text
stress_i = max(0, T_i - 35)
exposure_i = stress_i * (0.20 + 0.80 * activity_i) * humidity_penalty_i
```

`activity_i` is only a demo exposure-weight proxy. It is not claimed to be a measured population count.

## Intervention effects

### Tree

A tree applies a distance-decaying kernel that:

- reduces radiation through shade
- reduces ET deficit
- cools nearby cells
- consumes water
- can slightly reduce ventilation downwind when planted in an already strong wind corridor

This is why the system can reject or de-prioritize dense planting in a ventilation corridor.

### Green infrastructure

Green infrastructure has less direct shade than a tree but stronger evapotranspiration influence and greater daily water use.

### Localized water body

Water applies:

- evaporative cooling
- reduced ET deficit
- local humidity increase
- land and water resource cost

The humidity term prevents the model from treating water as universally beneficial to human thermal comfort.

### Cool roof

Cool roofs increase the effective albedo of valid building cells and reduce radiation absorption and heat-storage contribution.

They can only be placed on building cells.

### Cool pavement

Cool pavement reduces radiation absorption and heat storage on valid road/open cells.

## Spatial influence

Intervention effects use a Gaussian-style kernel:

```text
influence(d) = exp(-(d / radius)^2)
```

This creates a continuous neighborhood response rather than a tile-only effect.

The simulation also includes a small nearest-neighbor diffusion step to prevent independent-cell behavior.

## Optimizer

The current search is a constrained counterfactual greedy method.

At each iteration it:

1. enumerates valid candidate interventions
2. checks budget and water constraints
3. appends one candidate to the current plan
4. re-runs the simulation
5. measures person-weighted exposure
6. scores cooling benefit against cost and water use
7. accepts the strongest marginal candidate
8. repeats

Because every candidate is re-simulated after every accepted action, intervention interactions are re-evaluated rather than assumed additive.

The repository intentionally does **not** claim this is a global optimum.

## Multi-objective profiles

The API generates three profiles:

- `max_cooling`
- `balanced`
- `low_resource`

It then reports non-dominated plans across exposure, cost, and water.

This approximates the decision-support experience of a Pareto frontier without pretending the current search is a full NSGA-II implementation.

## Scientific upgrade path

Before real deployment:

1. replace synthetic city state with real geometry and material classes
2. ingest measured weather and thermal data
3. calibrate baseline coefficients
4. validate each intervention response independently
5. quantify uncertainty
6. benchmark against a trusted urban-microclimate simulator or measured interventions
7. benchmark multiple optimizers
8. only then consider a PINN or learned surrogate if it improves validated accuracy/latency

## What not to claim

Do not describe the current model as:

- full CFD
- ENVI-met equivalent
- a validated digital twin
- a trained PINN
- a guaranteed global optimum
- a source of deployable temperature-reduction numbers

The current implementation proves the decision workflow and provides a transparent baseline for validation.
