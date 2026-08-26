import type {
  CityCell,
  Intervention,
  InterventionType,
  Layers,
  Metrics,
  OptimizationResult,
  Scenario,
  SimulationResult,
} from './types';

export const TOOL_META: Record<InterventionType, { label: string; cost: number; water: number; valid: string[] }> = {
  tree: { label: 'Tree', cost: 40_000, water: 220, valid: ['open', 'vegetation'] },
  green: { label: 'Green infra', cost: 90_000, water: 420, valid: ['open', 'vegetation'] },
  water: { label: 'Water body', cost: 500_000, water: 700, valid: ['open'] },
  roof: { label: 'Cool roof', cost: 200_000, water: 0, valid: ['building'] },
  pavement: { label: 'Cool pavement', cost: 100_000, water: 0, valid: ['road', 'open'] },
};

const inside = (x: number, y: number, a: [number, number, number, number, number]) =>
  x >= a[0] && x <= a[2] && y >= a[1] && y <= a[3];

export function makeScenario(): Scenario {
  const width = 28;
  const height = 20;
  const buildings: [number, number, number, number, number][] = [
    [2, 2, 7, 6, 18], [10, 1, 14, 5, 24], [18, 2, 25, 6, 30],
    [2, 10, 8, 15, 20], [12, 10, 17, 17, 34], [21, 11, 26, 16, 22],
  ];
  const cells: CityCell[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let land: CityCell['land'] = 'open';
      let buildingHeight = 0;
      if ([0, 1, 8, 9, 15, 16, 17, 26, 27].includes(x) || [7, 8, 9, 18, 19].includes(y)) land = 'road';
      for (const b of buildings) {
        if (inside(x, y, b)) {
          land = 'building';
          buildingHeight = b[4];
          break;
        }
      }
      if (x >= 18 && x <= 20 && y >= 12 && y <= 16 && land === 'open') land = 'vegetation';
      if (x >= 10 && x <= 14 && y === 6) land = 'open';

      let albedo = 0.25, vegetation = 0.12, storage = 0.58;
      if (land === 'building') [albedo, vegetation, storage] = [0.20, 0.02, 0.84];
      if (land === 'road') [albedo, vegetation, storage] = [0.13, 0.01, 0.90];
      if (land === 'vegetation') [albedo, vegetation, storage] = [0.22, 0.78, 0.28];

      let shade = 0;
      for (const b of buildings) {
        for (let step = 1; step < 6; step++) {
          const sx = x - step, sy = y + Math.floor(step / 2);
          if (inside(sx, sy, b)) shade = Math.max(shade, Math.min(0.58, 0.09 * step + b[4] / 120));
        }
      }
      const radiation = clamp(0.92 - shade - 0.12 * vegetation, 0.16, 1);
      const etDeficit = clamp(0.92 - 0.90 * vegetation, 0.05, 1);
      const corridorBonus = [7, 8, 9].includes(y) ? 0.24 : 0;
      let buildingPenalty = 0;
      for (const b of buildings) {
        const dx = Math.max(b[0] - x, 0, x - b[2]);
        const dy = Math.max(b[1] - y, 0, y - b[3]);
        const d = Math.hypot(dx, dy);
        if (d < 3.2) buildingPenalty += ((3.2 - d) / 3.2) * Math.min(0.16, b[4] / 220);
      }
      const ventilation = clamp(0.58 + corridorBonus - buildingPenalty, 0.08, 1);
      let activity = land === 'road' ? 0.58 : 0.16;
      if ([7, 8, 9].includes(y)) activity = 0.90;
      if ([8, 9, 15, 16, 17].includes(x)) activity = Math.max(activity, 0.72);
      if (x >= 10 && x <= 14 && y >= 6 && y <= 9) activity = 1;
      if (land === 'building') activity *= 0.32;

      cells.push({ x, y, land, buildingHeight, albedo, vegetation, activity, radiation, storage, etDeficit, ventilation });
    }
  }

  return {
    id: 'demo-block-a', name: 'Dense Mixed-Use Block A', width, height, cellM: 5,
    ambientTemp: 35, humidity: 0.48, windSpeed: 2.4, windDirectionDeg: 270, cells,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const blank = (w: number, h: number, v = 0) => Array.from({ length: h }, () => Array(w).fill(v) as number[]);
const copy = (g: number[][]) => g.map((r) => [...r]);
const kernel = (d: number, r: number) => Math.exp(-Math.pow(d / r, 2));

function baseLayers(s: Scenario): Layers {
  const temperature = blank(s.width, s.height), radiation = blank(s.width, s.height), storage = blank(s.width, s.height),
    et_deficit = blank(s.width, s.height), ventilation = blank(s.width, s.height), activity = blank(s.width, s.height), exposure = blank(s.width, s.height);
  for (const c of s.cells) {
    const t = s.ambientTemp + 4.8 * c.radiation + 3.1 * c.storage + 2.2 * c.etDeficit + 2 * (1 - c.ventilation) + (c.land === 'road' ? 0.8 : 0);
    temperature[c.y][c.x] = t;
    radiation[c.y][c.x] = c.radiation;
    storage[c.y][c.x] = c.storage;
    et_deficit[c.y][c.x] = c.etDeficit;
    ventilation[c.y][c.x] = c.ventilation;
    activity[c.y][c.x] = c.activity;
    exposure[c.y][c.x] = Math.max(0, t - 35) * (0.2 + 0.8 * c.activity);
  }
  return { temperature, radiation, storage, et_deficit, ventilation, activity, exposure };
}

export function isValidPlacement(s: Scenario, type: InterventionType, x: number, y: number) {
  const cell = s.cells[y * s.width + x];
  return !!cell && TOOL_META[type].valid.includes(cell.land);
}

export function simulateLocal(s: Scenario, interventions: Intervention[]): SimulationResult {
  const base = baseLayers(s);
  const layers: Layers = {
    temperature: copy(base.temperature), radiation: copy(base.radiation), storage: copy(base.storage),
    et_deficit: copy(base.et_deficit), ventilation: copy(base.ventilation), activity: copy(base.activity), exposure: blank(s.width, s.height),
  };
  const humidity = blank(s.width, s.height);
  const warnings: string[] = [];
  let cost = 0, water = 0, accepted = 0;

  for (const item of interventions) {
    if (!isValidPlacement(s, item.type, item.x, item.y)) {
      warnings.push(`${TOOL_META[item.type].label} is not valid at (${item.x}, ${item.y}).`);
      continue;
    }
    const meta = TOOL_META[item.type];
    cost += meta.cost; water += meta.water; accepted++;
    const source = s.cells[item.y * s.width + item.x];
    for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
      const d = Math.hypot(x - item.x, y - item.y);
      if (item.type === 'tree' || item.type === 'green') {
        const r = item.type === 'tree' ? 3.2 : 3.6;
        const k = kernel(d, r), shade = (item.type === 'tree' ? 0.22 : 0.10) * k, et = (item.type === 'tree' ? 0.19 : 0.27) * k;
        layers.radiation[y][x] = clamp(layers.radiation[y][x] - shade, 0.05, 1);
        layers.et_deficit[y][x] = clamp(layers.et_deficit[y][x] - et, 0.02, 1);
        layers.temperature[y][x] -= 2.15 * shade + 1.55 * et;
        if (source.ventilation > 0.68 && x >= item.x) {
          const wake = k * Math.max(0, 1 - Math.abs(y - item.y) / 3);
          layers.ventilation[y][x] = clamp(layers.ventilation[y][x] - 0.07 * wake, 0.05, 1);
          layers.temperature[y][x] += 0.28 * wake;
        }
      } else if (item.type === 'water') {
        const k = kernel(d, 4.4), evap = 0.34 * k;
        layers.temperature[y][x] -= 1.95 * evap;
        layers.et_deficit[y][x] = clamp(layers.et_deficit[y][x] - 0.22 * k, 0.02, 1);
        humidity[y][x] += 0.08 * k;
      } else if (item.type === 'roof' && d <= 1.6) {
        const gain = 0.42 * kernel(d, 1.8);
        layers.radiation[y][x] = clamp(layers.radiation[y][x] - 0.62 * gain, 0.04, 1);
        layers.storage[y][x] = clamp(layers.storage[y][x] - 0.40 * gain, 0.05, 1);
        layers.temperature[y][x] -= 2.65 * gain;
      } else if (item.type === 'pavement') {
        const gain = 0.28 * kernel(d, 2.2);
        layers.radiation[y][x] = clamp(layers.radiation[y][x] - 0.38 * gain, 0.04, 1);
        layers.storage[y][x] = clamp(layers.storage[y][x] - 0.31 * gain, 0.05, 1);
        layers.temperature[y][x] -= 1.65 * gain;
      }
    }
  }

  for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
    const c = s.cells[y * s.width + x];
    layers.exposure[y][x] = Math.max(0, layers.temperature[y][x] - 35) * (0.2 + 0.8 * c.activity) * (1 + 0.28 * humidity[y][x]);
  }
  const flatT = layers.temperature.flat();
  const baseExposure = base.exposure.flat().reduce((a, b) => a + b, 0);
  const exposureIndex = layers.exposure.flat().reduce((a, b) => a + b, 0);
  const metrics: Metrics = {
    avg_surface_temperature: flatT.reduce((a, b) => a + b, 0) / flatT.length,
    peak_surface_temperature: Math.max(...flatT), exposure_index: exposureIndex,
    exposure_reduction_pct: baseExposure ? ((baseExposure - exposureIndex) / baseExposure) * 100 : 0,
    cost, water_per_day: water, accepted_interventions: accepted,
  };
  return { layers, metrics, warnings };
}

export function fingerprint(s: Scenario, result: SimulationResult, x: number, y: number) {
  const values = {
    radiation: result.layers.radiation[y][x],
    heat_storage: result.layers.storage[y][x],
    et_deficit: result.layers.et_deficit[y][x],
    ventilation_restriction: 1 - result.layers.ventilation[y][x],
  };
  const dominant = Object.entries(values).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k.replaceAll('_', ' ')).join(' + ');
  return { ...values, dominant };
}

function id(type: InterventionType, x: number, y: number, n: number) { return `${type}-${x}-${y}-${n}`; }

export function optimizeLocal(s: Scenario, budget: number, waterLimit: number, maxItems = 14): OptimizationResult {
  const baseline = simulateLocal(s, []);
  const candidates: Intervention[] = [];
  for (const c of s.cells) for (const type of Object.keys(TOOL_META) as InterventionType[]) {
    if (isValidPlacement(s, type, c.x, c.y) && ((c.x + 2 * c.y) % (type === 'water' || type === 'green' ? 3 : 2) === 0))
      candidates.push({ id: id(type, c.x, c.y, 0), type, x: c.x, y: c.y });
  }
  const plan: Intervention[] = [];
  const history: OptimizationResult['history'] = [];
  let spent = 0, water = 0;

  for (let iteration = 0; iteration < maxItems; iteration++) {
    let best: { action: Intervention; result: SimulationResult; score: number } | null = null;
    for (const c of candidates) {
      const meta = TOOL_META[c.type];
      if (spent + meta.cost > budget || water + meta.water > waterLimit) continue;
      const result = simulateLocal(s, [...plan, c]);
      const improvement = baseline.metrics.exposure_index - result.metrics.exposure_index;
      const score = improvement - baseline.metrics.exposure_index * (0.16 * result.metrics.cost / Math.max(1, budget) + 0.14 * result.metrics.water_per_day / Math.max(1, waterLimit));
      if (!best || score > best.score) best = { action: c, result, score };
    }
    if (!best) break;
    const action = { ...best.action, id: id(best.action.type, best.action.x, best.action.y, iteration + 1) };
    plan.push(action);
    spent += TOOL_META[action.type].cost; water += TOOL_META[action.type].water;
    const idx = candidates.findIndex((c) => c.type === action.type && c.x === action.x && c.y === action.y);
    if (idx >= 0) candidates.splice(idx, 1);
    history.push({ iteration: iteration + 1, exposureReduction: best.result.metrics.exposure_reduction_pct, action });
  }
  return { plan, result: simulateLocal(s, plan), history };
}
