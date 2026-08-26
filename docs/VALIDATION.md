# HeatRx Validation Protocol

The goal of validation is not to make the demo look impressive. It is to separate what is implemented from what is scientifically established.

## 1. Functional validation

The product must prove that:

- invalid interventions are rejected
- budget and water accounting are enforced
- every accepted intervention changes the spatial field
- thermal layers remain bounded
- a tree on a valid cell reduces local radiation/ET deficit according to the model
- a cool roof is restricted to building cells
- the optimizer never exceeds the supplied constraints
- the optimizer result is compared against the same baseline and constraints as manual strategies

These checks are covered by automated tests and should expand as the model grows.

## 2. Strategy benchmark

Run:

```bash
python benchmarks/run_benchmarks.py
```

All strategies receive the same:

- scenario
- budget
- daily water allowance
- maximum intervention count

Strategies compared:

1. baseline
2. deterministic random tree placement
3. hottest-valid-cell tree placement
4. HeatRx balanced counterfactual search

Report at minimum:

- person-weighted exposure index
- exposure reduction percentage
- average surface temperature
- peak surface temperature
- cost
- water per day
- intervention count

Do not manually cherry-pick the HeatRx scenario after seeing the results.

## 3. Model calibration plan

The current coefficients are demonstration values. Real calibration should be performed against one or more of:

- field sensors
- trusted urban microclimate simulation output
- published intervention studies with compatible geometry/weather
- high-resolution thermal observations where appropriate

Split calibration and evaluation locations/times so the same reference samples are not used to tune and report performance.

## 4. Intervention-level validation

Validate each intervention separately before validating portfolios.

### Tree / green infrastructure

Check:

- shaded vs unshaded surface response
- distance decay of cooling
- evapotranspiration response
- sensitivity to wind corridor placement

### Water

Check:

- distance-decay cooling
- humidity response
- sensitivity to ambient humidity and wind

### High-albedo roof / pavement

Check:

- absorbed-radiation reduction
- surface-temperature response
- reflected-radiation implications for pedestrian comfort if the model is extended to mean radiant temperature

## 5. Spatial validation

A successful model should not only match average temperature. Compare spatial structure:

- hotspot location precision
- hotspot recall
- per-cell MAE / RMSE
- rank correlation between predicted and reference hot cells
- thermal-gradient direction

## 6. Human-comfort validation

The current exposure metric is a proxy. A stronger version should move toward a validated comfort metric such as UTCI or PET when the required meteorological variables are available.

Until that is implemented, presentations should say **person-weighted heat-stress proxy**, not validated human thermal comfort.

## 7. Uncertainty

Future recommendations should report uncertainty, for example:

```text
Expected exposure reduction: 18%
90% interval: 13%–22%
```

Uncertainty can come from weather ensembles, parameter distributions, model residuals, or surrogate uncertainty.

## 8. Evidence hierarchy for judging

Strongest to weakest:

1. measured intervention outcome
2. validated high-fidelity reference simulation
3. calibrated reduced-order model on held-out conditions
4. uncalibrated reduced-order simulation
5. hand-authored visual effect

HeatRx currently sits at level 4 for scientific values while the interaction, constraint accounting, and optimization workflow are real software.

The objective after the MVP is to move the scientific engine upward without changing the product interface.
