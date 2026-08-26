# HeatRx Architecture

## Product contract

The renderer never owns the science.

It receives a city state, lets the user propose interventions, and animates state transitions. The simulation engine owns intervention effects and resource accounting.

That separation lets the current reduced-order engine later be replaced by a calibrated physics model, learned surrogate, or PINN without rewriting the game.

## Core loop

```text
Observe → Diagnose → Intervene → Simulate → Optimize → Explain
```

### Observe

The game exposes six spatial lenses:

- thermal field
- solar radiation
- heat storage
- evapotranspiration deficit
- ventilation
- person-weighted exposure

### Diagnose

Every cell exposes an interpretable thermal fingerprint instead of only a temperature value.

### Intervene

The user can place:

- tree
- green infrastructure
- localized water body
- cool roof
- cool pavement

Placement validity depends on the underlying land type.

### Simulate

The browser runs an instant matching preview model for game feel. The FastAPI service owns the backend simulation contract.

### Optimize

The backend evaluates resource-feasible counterfactual plans while re-running interactions after every accepted intervention.

### Explain

Results include metrics, warnings, thermal fingerprints, accepted interventions, and placement reasons.

## Runtime architecture

```text
┌─────────────────────────────────────────────┐
│ Next.js / React                             │
│                                             │
│  Game shell                                 │
│  ├─ intervention toolbar                    │
│  ├─ budget + water constraints              │
│  ├─ thermal fingerprint inspector           │
│  ├─ challenge / sandbox / explore modes     │
│  └─ human-vs-HeatRx comparison              │
│                                             │
│  Canvas renderer                            │
│  ├─ city geometry                           │
│  ├─ smooth thermal field                    │
│  ├─ intervention sprites                    │
│  ├─ airflow streamlines                     │
│  └─ animated state transitions              │
│                                             │
│  Instant local preview engine               │
└──────────────────┬──────────────────────────┘
                   │ JSON / HTTP
                   ▼
┌─────────────────────────────────────────────┐
│ FastAPI                                     │
│                                             │
│  /scenario  /fingerprint                    │
│  /simulate  /optimize  /compare             │
└──────────────────┬──────────────────────────┘
                   │
      ┌────────────┴────────────┐
      ▼                         ▼
┌───────────────┐      ┌─────────────────────┐
│ Thermal model │      │ Counterfactual      │
│               │      │ search              │
│ radiation     │      │                     │
│ storage       │◄────►│ budget constraints  │
│ ET deficit    │      │ water constraints   │
│ ventilation   │      │ placement validity  │
│ exposure      │      │ multi-objective     │
└───────────────┘      └─────────────────────┘
```

## City state

The deterministic demonstration block is a 28 × 20 grid of 5 m cells.

Each cell stores:

```text
land type
building height proxy
albedo
vegetation
activity / person-exposure proxy
radiation
heat storage
ET deficit
ventilation
```

The deterministic block exists so interaction and benchmark results are reproducible.

## Browser/backend split

### Browser

Responsibilities:

- interaction
- rendering
- immediate hover preview
- animation
- graceful fallback if backend is unavailable

The browser preview model mirrors the backend coefficients closely enough for the demo interaction loop, but final benchmark numbers should always come from the backend/benchmark harness.

### Backend

Responsibilities:

- authoritative simulation contract
- input validation
- resource accounting
- constrained optimization
- comparable result metrics
- model evolution

## Simulation output contract

A simulation returns:

```text
scenario metadata
accepted interventions
spatial layers
surface-temperature grid
exposure grid
resource + thermal metrics
warnings
explanations
```

The renderer only needs the previous and next spatial states to animate the change.

## Primary objective

HeatRx prioritizes person-weighted thermal exposure rather than average surface temperature alone.

Conceptually:

```text
minimize Σ thermal_stress(cell) × exposed_activity(cell)
```

subject to:

```text
cost ≤ budget
water ≤ daily allowance
placement is physically valid
```

## Optimization

The current implementation generates three planning profiles:

- maximum cooling
- balanced
- low resource

and derives a non-dominated subset across exposure, cost, and water.

The search is deliberately described as **constrained counterfactual search**, not as a guaranteed global optimum.

## Failure resilience

The demo is intentionally capable of running without the API.

If `NEXT_PUBLIC_API_URL` is unavailable, the browser uses its local transparent model and clearly labels the engine as the browser fallback.

This prevents network failure from destroying the judging demo while keeping backend integration real when deployed.

## Scientific upgrade boundary

The current model is a reduced-order demonstration model. It is not CFD and is not a validated PINN.

The upgrade sequence is:

1. real geometry + surface classes
2. measured weather / thermal inputs
3. calibration against a trusted reference
4. intervention-specific validation
5. uncertainty quantification
6. optimizer benchmarking
7. optional learned surrogate / PINN if justified by validated accuracy and latency

See `docs/MODEL.md` and `docs/VALIDATION.md`.
