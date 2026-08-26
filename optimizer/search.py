from simulation.simulator import simulate, PARAMS

def optimize(size: int, budget: float, water: float):
    """Deterministic greedy baseline. Replace with NSGA-II after validation harness exists."""
    candidates=[]
    for y in range(2,size-2,2):
        for x in range(2,size-2,2):
            candidates.append((x,y))
    plan=[]; spent=used_water=0
    baseline=simulate(size,[])["metrics"]["exposure_index"]
    while candidates:
        best=None
        for x,y in candidates:
            p=PARAMS["tree"]
            if spent+p["cost"]>budget or used_water+p["water"]>water: continue
            trial=plan+[{"type":"tree","x":x,"y":y}]
            score=simulate(size,trial)["metrics"]["exposure_index"]
            if best is None or score<best[0]: best=(score,x,y)
        if best is None: break
        _,x,y=best; plan.append({"type":"tree","x":x,"y":y}); candidates.remove((x,y)); spent+=PARAMS["tree"]["cost"]; used_water+=PARAMS["tree"]["water"]
        if len(plan)>=12: break
    result=simulate(size,plan)
    return {"baseline_exposure":baseline,"plan":plan,"result":result}
