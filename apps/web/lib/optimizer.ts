import { TOOL_META, isValidPlacement, simulateLocal } from './simulation';
import type { Intervention, InterventionType, OptimizationResult, Scenario } from './types';

const TYPES = Object.keys(TOOL_META) as InterventionType[];

function actionId(type: InterventionType, x: number, y: number, n: number) {
  return `fallback-${type}-${x}-${y}-${n}`;
}

export function optimizeFallback(
  scenario: Scenario,
  budget: number,
  waterLimit: number,
  maxItems = 12,
): OptimizationResult {
  const baseline = simulateLocal(scenario, []);
  const all: Intervention[] = [];

  for (const cell of scenario.cells) {
    for (const type of TYPES) {
      if (!isValidPlacement(scenario, type, cell.x, cell.y)) continue;
      if (type === 'tree' || (cell.x + 2 * cell.y) % 2 === 0) {
        all.push({ id: actionId(type, cell.x, cell.y, 0), type, x: cell.x, y: cell.y });
      }
    }
  }

  // One-action prefilter keeps the offline demo responsive on modest laptops.
  const candidates = all
    .map((action) => {
      const meta = TOOL_META[action.type];
      if (meta.cost > budget || meta.water > waterLimit) return null;
      const result = simulateLocal(scenario, [action]);
      const improvement = baseline.metrics.exposure_index - result.metrics.exposure_index;
      const resourcePenalty = baseline.metrics.exposure_index * (
        0.01 * result.metrics.cost / Math.max(1, budget) +
        0.005 * result.metrics.water_per_day / Math.max(1, waterLimit)
      );
      return { action, score: improvement - resourcePenalty };
    })
    .filter((item): item is { action: Intervention; score: number } => Boolean(item))
    .sort((a, b) => b.score - a.score)
    .slice(0, 72)
    .map((item) => item.action);

  const plan: Intervention[] = [];
  const history: OptimizationResult['history'] = [];
  let current = baseline;

  for (let iteration = 0; iteration < maxItems; iteration++) {
    const spent = plan.reduce((sum, item) => sum + TOOL_META[item.type].cost, 0);
    const water = plan.reduce((sum, item) => sum + TOOL_META[item.type].water, 0);
    const occupied = new Set(plan.map((item) => `${item.x}:${item.y}`));
    let best: { action: Intervention; result: ReturnType<typeof simulateLocal>; score: number } | null = null;

    for (const candidate of candidates) {
      if (occupied.has(`${candidate.x}:${candidate.y}`)) continue;
      const meta = TOOL_META[candidate.type];
      if (spent + meta.cost > budget || water + meta.water > waterLimit) continue;

      const result = simulateLocal(scenario, [...plan, candidate]);
      if (result.metrics.exposure_index >= current.metrics.exposure_index - 1e-9) continue;

      const improvement = baseline.metrics.exposure_index - result.metrics.exposure_index;
      const resourcePenalty = baseline.metrics.exposure_index * (
        0.01 * result.metrics.cost / Math.max(1, budget) +
        0.005 * result.metrics.water_per_day / Math.max(1, waterLimit)
      );
      const score = improvement - resourcePenalty;
      if (!best || score > best.score) best = { action: candidate, result, score };
    }

    if (!best) break;
    const action = { ...best.action, id: actionId(best.action.type, best.action.x, best.action.y, iteration + 1) };
    plan.push(action);
    current = best.result;
    history.push({
      iteration: iteration + 1,
      exposureReduction: best.result.metrics.exposure_reduction_pct,
      action,
    });
  }

  return { plan, result: simulateLocal(scenario, plan), history };
}
