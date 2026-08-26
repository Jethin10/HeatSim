# HeatRx Judge Demo

## One-line setup

> Everyone knows trees can cool cities. The hard problem is deciding what to place, exactly where to place it, and whether that choice is still good when budget, water, airflow, and human exposure are considered together.

Then open HeatRx. Do not start with the architecture slide.

## 2.5-minute live flow

### 0:00 — Show the city, not the model

Open **Challenge** mode in the Thermal lens.

Point out only:

- fixed budget
- daily water allowance
- human-exposure score

Do not explain every control.

### 0:15 — Prove the diagnosis is deeper than a heat map

Hover a visibly hot cell.

The right panel exposes:

- radiation
- heat storage
- ET deficit
- ventilation restriction
- human activity weight

Say:

> Two places can be equally hot for completely different reasons. HeatRx diagnoses the mechanism before recommending an intervention.

### 0:35 — Make the judge play

Select a tree and move it across several cells.

The ghost preview should show the marginal person-exposure effect before placement.

Place it on a valid high-exposure cell.

The thermal field animates around the intervention rather than changing a single tile.

### 0:55 — Show a bad idea

Switch to **Airflow**.

Move a tree or green-infrastructure intervention into the central high-flow corridor.

Explain that vegetation can create shade and evapotranspiration while also changing ventilation. The system therefore models a downwind penalty rather than assuming `tree = fixed cooling` everywhere.

### 1:15 — Add a second intervention mechanism

Place a cool roof on a valid building or cool pavement on a road.

Switch briefly between Radiation and Storage lenses so the judge can see that different interventions change different thermal mechanisms.

### 1:35 — The challenge reveal

Say:

> We just made a plan manually. But a planner cannot manually search hundreds or thousands of interacting placements.

Press **OPTIMIZE WITH HEATRX**.

HeatRx saves the manual score, clears the plan, and animates the accepted actions from its counterfactual search.

The scan animation should make the computation visible without pretending that every flashed frame is a literal optimizer generation.

### 2:05 — Human vs HeatRx

The right panel shows:

```text
YOUR PLAN      −X%
HEATRX PLAN    −Y%
```

Both are evaluated under the same budget and water constraints.

The strongest closing line is:

> The product is not telling a city that greenery is good. It is searching where limited cooling resources create the most human benefit, while making the physical trade-offs visible before construction.

### 2:25 — Only then discuss architecture

If the judge asks how it works, explain:

```text
city state
→ mechanism-aware reduced-order simulation
→ counterfactual intervention evaluation
→ constrained optimization
→ animated decision-support interface
```

## What is actually implemented

The live repository includes:

- 28 × 20 playable city-block simulation
- six thermal/mechanism lenses
- thermal fingerprint inspection
- trees
- green infrastructure
- localized water bodies
- cool roofs
- cool pavement
- spatial intervention kernels
- ventilation interaction penalty
- humidity penalty around water
- person-weighted exposure proxy
- land-validity rules
- budget constraint
- water constraint
- browser instant-preview engine
- FastAPI simulation API
- backend optimizer
- browser fallback when the API is unavailable
- human-vs-HeatRx challenge flow
- reproducible benchmark harness
- automated web build and simulation tests

## What must not be claimed

Do not say that the current numeric values are:

- measured city outcomes
- validated CFD
- ENVI-met equivalent
- a trained PINN output
- a guaranteed global optimum

Say instead:

> The current engine is an explicit reduced-order simulation that makes the complete decision workflow executable. Its next scientific step is calibration against trusted reference simulation or measurements.

That answer is stronger than pretending the hackathon model has already been field validated.

## Demo failure recovery

### Backend unavailable

The web app automatically falls back to the matching browser model. The UI labels the active engine.

Continue the demo normally, then mention that production optimization normally calls the FastAPI service.

### Optimization takes too long

Use the browser fallback. The local search is intentionally available for demo resilience.

### Judge places an invalid intervention

Good. Let the rejection happen. It proves the map is not only decorative.

### Judge beats the optimizer

Do not hide it.

The UI deliberately says that the baseline search should be improved rather than claiming a fake win.

Then explain that the repository benchmarks the optimizer against baselines and that the search algorithm is swappable.

## Before final presentation

Run:

```bash
PYTHONPATH=. pytest -q
PYTHONPATH=. python benchmarks/run_benchmarks.py
cd apps/web && npm install && npm run build
```

Record the benchmark output before putting any percentage into the pitch deck.
