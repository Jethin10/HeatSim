import type { Intervention, OptimizationResult, SimulationResult } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || '';

export function hasRemoteApi() {
  return Boolean(API_URL);
}

export async function optimizeRemote(input: {
  budget: number;
  water: number;
  maxItems?: number;
  objective?: 'balanced' | 'max_cooling' | 'low_resource';
}): Promise<OptimizationResult> {
  if (!API_URL) throw new Error('NEXT_PUBLIC_API_URL is not configured');
  const response = await fetch(`${API_URL}/optimize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      scenario_id: 'demo-block-a',
      budget: input.budget,
      water: input.water,
      max_items: input.maxItems ?? 12,
      objective: input.objective ?? 'balanced',
    }),
  });
  if (!response.ok) throw new Error(`Optimizer API returned ${response.status}`);
  const payload = await response.json();
  const selected = payload.selected;
  return {
    plan: selected.plan.map((i: Omit<Intervention, 'id'>, n: number) => ({ ...i, id: `remote-${i.type}-${i.x}-${i.y}-${n}` })),
    result: selected.result as SimulationResult,
    history: selected.history.map((h: any) => ({
      iteration: h.iteration,
      exposureReduction: h.exposure_reduction_pct,
      action: { ...h.best_action, id: `remote-step-${h.iteration}` },
    })),
  };
}

export async function simulateRemote(interventions: Intervention[]): Promise<SimulationResult> {
  if (!API_URL) throw new Error('NEXT_PUBLIC_API_URL is not configured');
  const response = await fetch(`${API_URL}/simulate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      scenario_id: 'demo-block-a',
      interventions: interventions.map(({ type, x, y }) => ({ type, x, y })),
    }),
  });
  if (!response.ok) throw new Error(`Simulation API returned ${response.status}`);
  return response.json();
}
