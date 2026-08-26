from __future__ import annotations

from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from optimizer.search import optimize
from simulation.scenario import get_scenario
from simulation.simulator import PARAMS, VALID_LAND, fingerprint, simulate


app = FastAPI(
    title="HeatRx Simulation API",
    version="0.3.0",
    description="Mechanism-aware urban cooling simulation and constrained intervention search.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

InterventionType = Literal["tree", "green", "water", "roof", "pavement"]
ObjectiveType = Literal["balanced", "max_cooling", "low_resource"]


class Intervention(BaseModel):
    type: InterventionType
    x: int
    y: int


class SimulationRequest(BaseModel):
    scenario_id: str = "demo-block-a"
    interventions: list[Intervention] = Field(default_factory=list)


class OptimizeRequest(BaseModel):
    scenario_id: str = "demo-block-a"
    budget: float = 3_000_000
    water: float = 8_000
    max_items: int = Field(default=14, ge=1, le=30)
    objective: ObjectiveType = "balanced"


class CompareRequest(OptimizeRequest):
    manual_interventions: list[Intervention] = Field(default_factory=list)


@app.get("/health")
def health():
    return {"status": "ok", "service": "heatrx-api", "version": app.version}


@app.get("/interventions")
def interventions_catalog():
    return {
        kind: {
            "cost": p["cost"],
            "water_per_day": p["water"],
            "valid_land": sorted(VALID_LAND[kind]),
        }
        for kind, p in PARAMS.items()
    }


@app.get("/scenario/{scenario_id}")
def scenario(scenario_id: str):
    try:
        scenario_data = get_scenario(scenario_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    baseline = simulate(interventions=[], scenario_id=scenario_id)
    return {"scenario": scenario_data.to_dict(), "baseline": baseline}


@app.get("/scenario/{scenario_id}/fingerprint/{x}/{y}")
def cell_fingerprint(scenario_id: str, x: int, y: int):
    try:
        return fingerprint(x, y, scenario_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/simulate")
def run_simulation(req: SimulationRequest):
    try:
        return simulate(
            interventions=[i.model_dump() for i in req.interventions],
            scenario_id=req.scenario_id,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/optimize")
def run_optimization(req: OptimizeRequest):
    try:
        return optimize(
            budget=req.budget,
            water=req.water,
            scenario_id=req.scenario_id,
            max_items=req.max_items,
            objective=req.objective,
        )
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/compare")
def compare(req: CompareRequest):
    try:
        manual = simulate(
            interventions=[i.model_dump() for i in req.manual_interventions],
            scenario_id=req.scenario_id,
        )
        optimized = optimize(
            budget=req.budget,
            water=req.water,
            scenario_id=req.scenario_id,
            max_items=req.max_items,
            objective=req.objective,
        )
        best = optimized["selected"]["result"]
        return {
            "manual": manual,
            "optimized": optimized,
            "delta": {
                "exposure_index": round(
                    manual["metrics"]["exposure_index"] - best["metrics"]["exposure_index"], 3
                ),
                "exposure_reduction_pct_points": round(
                    best["metrics"]["exposure_reduction_pct"] - manual["metrics"]["exposure_reduction_pct"], 3
                ),
            },
        }
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
