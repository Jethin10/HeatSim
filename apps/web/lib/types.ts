export type InterventionType = 'tree' | 'green' | 'water' | 'roof' | 'pavement';
export type Tool = 'inspect' | InterventionType;
export type Overlay = 'temperature' | 'radiation' | 'storage' | 'et_deficit' | 'ventilation' | 'exposure';
export type GameMode = 'explore' | 'sandbox' | 'challenge';

export type LandType = 'building' | 'road' | 'open' | 'vegetation';

export type CityCell = {
  x: number;
  y: number;
  land: LandType;
  buildingHeight: number;
  albedo: number;
  vegetation: number;
  activity: number;
  radiation: number;
  storage: number;
  etDeficit: number;
  ventilation: number;
};

export type Intervention = {
  id: string;
  type: InterventionType;
  x: number;
  y: number;
};

export type Layers = {
  temperature: number[][];
  radiation: number[][];
  storage: number[][];
  et_deficit: number[][];
  ventilation: number[][];
  activity: number[][];
  exposure: number[][];
};

export type Metrics = {
  avg_surface_temperature: number;
  peak_surface_temperature: number;
  exposure_index: number;
  exposure_reduction_pct: number;
  cost: number;
  water_per_day: number;
  accepted_interventions: number;
};

export type SimulationResult = {
  layers: Layers;
  metrics: Metrics;
  warnings: string[];
};

export type Scenario = {
  id: string;
  name: string;
  width: number;
  height: number;
  cellM: number;
  ambientTemp: number;
  humidity: number;
  windSpeed: number;
  windDirectionDeg: number;
  cells: CityCell[];
};

export type OptimizationStep = {
  iteration: number;
  exposureReduction: number;
  action: Intervention;
};

export type OptimizationResult = {
  plan: Intervention[];
  result: SimulationResult;
  history: OptimizationStep[];
};
