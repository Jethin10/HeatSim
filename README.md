# HeatSim / HeatRx

HeatRx is a playable urban-cooling simulator built around one question:

> Given this exact city block and limited budget, water, and land, what should we change, where should we change it, and what happens if we do?

Instead of stopping at a heat map, HeatRx lets a user place interventions like a strategy game, watch the thermal field respond, inspect the physical mechanism behind each hotspot, and then ask the optimizer to search for a stronger plan under the same resource constraints.

## Why this exists

Urban heat is often treated as a detection problem. HeatRx treats it as a spatial intervention problem.

The system is designed around:

- mechanism-aware thermal diagnosis
- counterfactual intervention simulation
- person-weighted heat exposure
- interaction-aware effects such as shade, evapotranspiration, albedo, humidity, and ventilation penalties
- resource-constrained search across trees, green infrastructure, localized water bodies, cool roofs, and cool pavements
- explainable recommendations instead of a single opaque score

## Demo loop

1. Open the dense-city scenario.
2. Switch between Thermal, Radiation, Storage, ET Deficit, Airflow, and Exposure lenses.
3. Hover any cell to inspect its thermal fingerprint.
4. Place trees, green infrastructure, water, cool roofs, or cool pavement.
5. Watch the surrounding field animate instead of changing only one tile.
6. Stay inside a fixed budget and daily water allowance.
7. Press **OPTIMIZE WITH HEATRX**.
8. Watch the optimizer construct a new plan under the same constraints.
9. Compare the human plan against the HeatRx plan.

## Current model boundary

The repository currently uses a transparent reduced-order urban thermal model so the entire product is executable and auditable.

It is **not** presented as CFD, ENVI-met, or a calibrated PINN replacement. Coefficients are intentionally explicit and must be calibrated against trusted reference simulations or measurements before making real-world cooling claims.

That distinction is deliberate: the hackathon demo should be scientifically honest while still proving the full simulation, interaction, optimization, and decision-support workflow.

## Architecture

```text
Browser
  │
  ├── Next.js / React game UI
  │     ├── animated thermal canvas
  │     ├── instant local preview engine
  │     ├── thermal fingerprint inspector
  │     └── challenge / sandbox / explore modes
  │
  └── FastAPI simulation service
        ├── deterministic city scenario
        ├── reduced-order thermal engine
        ├── human exposure model
        ├── intervention validity + resource accounting
        └── constrained counterfactual optimizer
```

The browser has a matching fallback simulation so the demo remains usable even if the API is temporarily unavailable. When `NEXT_PUBLIC_API_URL` is configured, optimization is sent to the FastAPI backend.

## Repository layout

```text
HeatSim/
├── apps/
│   ├── web/                 # Next.js playable simulator
│   └── api/                 # FastAPI service
├── simulation/
│   ├── scenario.py          # deterministic mixed-use city block
│   └── simulator.py         # mechanism-aware thermal model
├── optimizer/
│   └── search.py            # resource-constrained counterfactual search
├── benchmarks/
│   └── run_benchmarks.py    # reproducible strategy comparison
├── tests/
│   └── test_simulation.py
├── docs/
│   ├── ARCHITECTURE.md
│   └── DEMO.md
└── docker-compose.yml
```

## Run locally

### Fastest: Docker

```bash
docker compose up --build
```

Then open `http://localhost:3000`.

The API runs at `http://localhost:8000`.

### Manual development

Backend:

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\\Scripts\\activate
pip install -r apps/api/requirements.txt
uvicorn apps.api.main:app --reload
```

Frontend:

```bash
cd apps/web
cp .env.example .env.local
npm install
npm run dev
```

## API

Key endpoints:

```text
GET  /health
GET  /interventions
GET  /scenario/demo-block-a
GET  /scenario/demo-block-a/fingerprint/{x}/{y}
POST /simulate
POST /optimize
POST /compare
```

Example simulation payload:

```json
{
  "scenario_id": "demo-block-a",
  "interventions": [
    { "type": "tree", "x": 10, "y": 6 },
    { "type": "roof", "x": 3, "y": 3 }
  ]
}
```

Example optimizer payload:

```json
{
  "scenario_id": "demo-block-a",
  "budget": 3000000,
  "water": 8000,
  "max_items": 12,
  "objective": "balanced"
}
```

Available objectives are `balanced`, `max_cooling`, and `low_resource`.

## Thermal fingerprint

Each spatial cell is represented through four interpretable mechanisms:

```text
Radiation load
Heat storage
Evapotranspiration deficit
Ventilation restriction
```

Two cells with the same surface temperature can therefore receive different recommendations.

## Human exposure objective

HeatRx does not optimize average temperature alone. The demo model weights thermal stress by an activity proxy so a hot pedestrian corridor matters more than an equally hot low-occupancy surface.

This is a demonstration proxy for person-hours of exposure, not a population estimate.

## Optimization

The current optimizer is a constrained counterfactual greedy search that re-simulates marginal effects after every accepted action. This means intervention interactions are re-evaluated rather than assumed independent.

It returns multiple resource profiles and a Pareto-style non-dominated subset. It is **not claimed to be a global optimum**.

That leaves a clean upgrade path to NSGA-II, Bayesian optimization, mixed-integer programming, or another validated optimizer later.

## Validation

Run:

```bash
python benchmarks/run_benchmarks.py
```

The benchmark compares:

- baseline
- deterministic random tree placement
- hottest-valid-cell tree placement
- HeatRx balanced search

under the same budget, water, and intervention-count constraints.

The output is written to `benchmarks/latest.json`.

Run tests with:

```bash
pytest -q
```

## Upgrade path after the hackathon MVP

The architecture is intentionally model-swappable. The next scientific upgrades should be:

1. replace synthetic block inputs with real building footprints and surface classes
2. ingest measured weather and thermal remote-sensing data
3. calibrate coefficients against a trusted microclimate simulator or field measurements
4. validate intervention kernels separately
5. add uncertainty intervals
6. replace the baseline search with a properly benchmarked multi-objective optimizer
7. only then evaluate whether a PINN or learned surrogate improves accuracy/latency enough to justify its complexity

## Principle

The renderer never needs to know whether the future backend is a reduced-order model, CFD surrogate, PINN, or another simulator.

It only consumes:

```text
old city state → simulated city state → animate the difference
```

That keeps the game experience stable while the scientific engine becomes more sophisticated.
