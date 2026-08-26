from fastapi import FastAPI
from pydantic import BaseModel
from typing import Literal
from simulation.simulator import simulate
from optimizer.search import optimize

app = FastAPI(title="HeatRx Simulation API", version="0.1.0")

class Intervention(BaseModel):
    type: Literal["tree", "water", "roof", "pavement"]
    x: int
    y: int

class SimulationRequest(BaseModel):
    size: int = 18
    interventions: list[Intervention] = []

class OptimizeRequest(BaseModel):
    size: int = 18
    budget: float = 3_000_000
    water: float = 8_000

@app.get("/health")
def health(): return {"status": "ok"}

@app.post("/simulate")
def run_simulation(req: SimulationRequest):
    return simulate(req.size, [i.model_dump() for i in req.interventions])

@app.post("/optimize")
def run_optimization(req: OptimizeRequest):
    return optimize(req.size, req.budget, req.water)
