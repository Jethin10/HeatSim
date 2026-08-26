# HeatSim / HeatRx

A playable urban-cooling simulator for evaluating and optimizing the placement of trees, green infrastructure, localized water bodies, cool roofs, and cool pavements under budget, water, and land constraints.

The product goal is simple: let a judge or planner manipulate a city block like a strategy game, watch heat and exposure respond, then compare their plan against an optimizer.

## Core loop

Observe → Diagnose → Intervene → Simulate → Optimize → Explain

## Planned stack

- Web: Next.js + TypeScript + PixiJS
- API: FastAPI + Pydantic
- Simulation: Python + NumPy
- Optimization: evolutionary multi-objective search
- Data: synthetic scenario first, then real GIS/satellite inputs

## Repo status

Initial scaffold in progress.