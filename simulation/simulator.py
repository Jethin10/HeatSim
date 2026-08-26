import math

PARAMS = {
    "tree": {"cooling": 1.8, "radius": 3.0, "cost": 40_000, "water": 220},
    "water": {"cooling": 2.5, "radius": 4.2, "cost": 500_000, "water": 700},
    "roof": {"cooling": 1.4, "radius": 2.2, "cost": 200_000, "water": 0},
    "pavement": {"cooling": 1.0, "radius": 2.0, "cost": 100_000, "water": 0},
}

def baseline(size: int):
    return [[38 + 5 * math.exp(-((x-size*.58)**2+(y-size*.46)**2)/(size*1.9)) for x in range(size)] for y in range(size)]

def simulate(size: int, interventions: list[dict]):
    grid = baseline(size)
    total_cost = total_water = 0
    for item in interventions:
        p = PARAMS[item["type"]]; total_cost += p["cost"]; total_water += p["water"]
        for y in range(size):
            for x in range(size):
                d = math.hypot(x-item["x"], y-item["y"])
                grid[y][x] -= p["cooling"] * math.exp(-d/p["radius"])
    flat = [v for row in grid for v in row]
    avg = sum(flat)/len(flat)
    exposure = sum(max(0, t-35) for t in flat)/len(flat)
    return {"temperature_grid": grid, "metrics": {"avg_surface_temperature": round(avg,3), "exposure_index": round(exposure,3), "cost": total_cost, "water_per_day": total_water}}
