'use client';

import { useMemo, useRef, useState } from 'react';
import ThermalCanvas from './ThermalCanvas';
import { hasRemoteApi, optimizeRemote } from '../lib/api';
import { optimizeFallback } from '../lib/optimizer';
import { TOOL_META, fingerprint, isValidPlacement, makeScenario, simulateLocal } from '../lib/simulation';
import type { GameMode, Intervention, InterventionType, OptimizationResult, Overlay, Tool } from '../lib/types';

const BUDGET_LIMIT=3_000_000,WATER_LIMIT=8_000,CHALLENGE_TARGET=20;
const overlayLabels:{key:Overlay;label:string}[]=[
  {key:'temperature',label:'Thermal'},{key:'radiation',label:'Radiation'},{key:'storage',label:'Storage'},
  {key:'et_deficit',label:'ET deficit'},{key:'ventilation',label:'Airflow'},{key:'exposure',label:'Exposure'},
];
const toolOrder:InterventionType[]=['tree','green','water','roof','pavement'];
const money=(v:number)=>`₹${(v/100_000).toFixed(v>=1_000_000?1:2)}L`;
const pct=(v:number)=>`${v>=0?'−':'+'}${Math.abs(v).toFixed(1)}%`;

export default function HeatGame(){
  const scenario=useMemo(()=>makeScenario(),[]);
  const [mode,setMode]=useState<GameMode>('challenge'),[overlay,setOverlay]=useState<Overlay>('temperature'),[tool,setTool]=useState<Tool>('tree');
  const [interventions,setInterventions]=useState<Intervention[]>([]),[hover,setHover]=useState<{x:number;y:number}|null>(null),[pulse,setPulse]=useState<{x:number;y:number;at:number}|null>(null);
  const [optimizing,setOptimizing]=useState(false),[optimizationStep,setOptimizationStep]=useState(0),[manualScore,setManualScore]=useState<number|null>(null),[optimizedScore,setOptimizedScore]=useState<number|null>(null);
  const [notice,setNotice]=useState('Place an intervention and watch the thermal field respond.');
  const [engine,setEngine]=useState<'local'|'api'>(hasRemoteApi()?'api':'local');
  const runToken=useRef(0);

  const result=useMemo(()=>simulateLocal(scenario,interventions),[scenario,interventions]);
  const budgetLimit=mode==='sandbox'?Number.POSITIVE_INFINITY:BUDGET_LIMIT,waterLimit=mode==='sandbox'?Number.POSITIVE_INFINITY:WATER_LIMIT;
  const budgetLeft=budgetLimit-result.metrics.cost,waterLeft=waterLimit-result.metrics.water_per_day;
  const occupied=useMemo(()=>new Set(interventions.map(i=>`${i.x}:${i.y}`)),[interventions]);
  const preview=useMemo(()=>{
    if(!hover||tool==='inspect'||occupied.has(`${hover.x}:${hover.y}`)||!isValidPlacement(scenario,tool,hover.x,hover.y))return null;
    const meta=TOOL_META[tool];if(result.metrics.cost+meta.cost>budgetLimit||result.metrics.water_per_day+meta.water>waterLimit)return null;
    return simulateLocal(scenario,[...interventions,{id:'preview',type:tool,x:hover.x,y:hover.y}]);
  },[hover,tool,scenario,interventions,occupied,result.metrics.cost,result.metrics.water_per_day,budgetLimit,waterLimit]);
  const displayResult=preview||result,inspected=hover?scenario.cells[hover.y*scenario.width+hover.x]:null,fp=hover?fingerprint(scenario,result,hover.x,hover.y):null;
  const challengeProgress=Math.min(100,Math.max(0,result.metrics.exposure_reduction_pct/CHALLENGE_TARGET*100));

  const place=(x:number,y:number)=>{
    if(optimizing)return;
    if(tool==='inspect'||mode==='explore'){setNotice(`Inspecting cell ${x},${y}. Switch thermal lenses to understand the hotspot.`);return;}
    if(occupied.has(`${x}:${y}`)){setNotice('That cell already contains an intervention. Use Undo or choose another location.');return;}
    if(!isValidPlacement(scenario,tool,x,y)){setNotice(`${TOOL_META[tool].label} cannot be placed on ${scenario.cells[y*scenario.width+x].land}.`);return;}
    const meta=TOOL_META[tool];if(result.metrics.cost+meta.cost>budgetLimit){setNotice('Budget constraint reached. Remove an intervention or let HeatRx re-plan.');return;}
    if(result.metrics.water_per_day+meta.water>waterLimit){setNotice('Water constraint reached. Try a cool roof or cool pavement instead.');return;}
    setInterventions(old=>[...old,{id:`${tool}-${x}-${y}-${Date.now()}`,type:tool,x,y}]);setPulse({x,y,at:performance.now()});setManualScore(null);setOptimizedScore(null);
    const cell=scenario.cells[y*scenario.width+x];
    if((tool==='tree'||tool==='green')&&cell.ventilation>.68)setNotice(`${meta.label} placed in a high-flow corridor: shade/ET help, but a downwind ventilation penalty is being modeled.`);
    else setNotice(`${meta.label} placed. The field is recomputing spatially.`);
  };
  const reset=()=>{runToken.current++;setInterventions([]);setManualScore(null);setOptimizedScore(null);setOptimizationStep(0);setOptimizing(false);setNotice('Block reset to baseline.');};
  const undo=()=>{if(optimizing)return;setInterventions(old=>old.slice(0,-1));setManualScore(null);setOptimizedScore(null);setNotice('Last intervention removed.');};

  const animatePlan=(answer:OptimizationResult,token:number)=>{
    setInterventions([]);let i=0;const timer=window.setInterval(()=>{
      if(runToken.current!==token){window.clearInterval(timer);return;}
      if(i>=answer.plan.length){window.clearInterval(timer);setOptimizing(false);setOptimizedScore(answer.result.metrics.exposure_reduction_pct);setNotice('Search complete. Compare your plan with the resource-constrained HeatRx plan.');return;}
      const next=answer.plan[i];setInterventions(old=>[...old,next]);setPulse({x:next.x,y:next.y,at:performance.now()});setOptimizationStep(i+1);i++;
    },150);
  };

  const optimize=async()=>{
    if(optimizing)return;const token=++runToken.current;setManualScore(result.metrics.exposure_reduction_pct);setOptimizedScore(null);setOptimizing(true);setOptimizationStep(0);setNotice('HeatRx is evaluating counterfactual placements under the same resource limits…');
    await new Promise(r=>window.setTimeout(r,100));if(runToken.current!==token)return;
    let answer:OptimizationResult;
    try{
      if(hasRemoteApi()){answer=await optimizeRemote({budget:BUDGET_LIMIT,water:WATER_LIMIT,maxItems:12,objective:'balanced'});setEngine('api');}
      else throw new Error('No API configured');
    }catch{
      answer=optimizeFallback(scenario,BUDGET_LIMIT,WATER_LIMIT,12);setEngine('local');setNotice('Backend unavailable. HeatRx switched to its in-browser counterfactual fallback so the demo can continue.');
    }
    if(runToken.current===token)animatePlan(answer,token);
  };

  const changeMode=(m:GameMode)=>{setMode(m);if(m==='explore')setTool('inspect');setNotice(`${m[0].toUpperCase()+m.slice(1)} mode active.`)};

  return <main className="app-shell">
    <header className="topbar"><div className="brand"><strong>HEATRX</strong><span>urban cooling simulator</span></div><nav className="lens-nav" aria-label="Thermal layers">{overlayLabels.map(o=><button key={o.key} className={overlay===o.key?'selected':''} onClick={()=>setOverlay(o.key)}>{o.label}</button>)}</nav><div className="mode-switch" aria-label="Game mode">{(['explore','sandbox','challenge'] as GameMode[]).map(m=><button key={m} className={mode===m?'selected':''} onClick={()=>changeMode(m)}>{m}</button>)}</div></header>
    <section className="metric-rail"><Metric label="Budget left" value={mode==='sandbox'?'∞':money(Math.max(0,budgetLeft))} sub={mode==='sandbox'?'unlimited sandbox':`of ${money(BUDGET_LIMIT)}`}/><Metric label="Water left" value={mode==='sandbox'?'∞':`${Math.max(0,waterLeft).toLocaleString()} L`} sub={mode==='sandbox'?'unlimited sandbox':`of ${WATER_LIMIT.toLocaleString()} L/day`}/><Metric label="Average surface" value={`${result.metrics.avg_surface_temperature.toFixed(1)}°C`} sub={`peak ${result.metrics.peak_surface_temperature.toFixed(1)}°C`}/><Metric label="Human exposure" value={pct(result.metrics.exposure_reduction_pct)} sub={mode==='challenge'?`target ${CHALLENGE_TARGET}% reduction`:'vs baseline person-weighted exposure'} accent/><Metric label="Interventions" value={`${result.metrics.accepted_interventions}`} sub={`${scenario.cellM} m spatial cells`}/></section>
    <section className="workspace">
      <aside className="tool-panel"><div className="panel-heading"><span>Interventions</span><small>{mode==='explore'?'READ ONLY':'PLACE ON MAP'}</small></div><button className={`tool inspect ${tool==='inspect'?'active':''}`} onClick={()=>setTool('inspect')}><span className="tool-mark">⌖</span><span><b>Inspect</b><small>Read thermal fingerprint</small></span></button>{toolOrder.map(t=>{const meta=TOOL_META[t];return <button key={t} disabled={mode==='explore'} className={`tool ${tool===t?'active':''}`} onClick={()=>setTool(t)}><span className={`tool-mark ${t}`}>{t==='tree'?'●':t==='green'?'╱':t==='water'?'≈':t==='roof'?'□':'▦'}</span><span><b>{meta.label}</b><small>{money(meta.cost)}{meta.water?` · ${meta.water} L/d`:' · no water'}</small></span></button>})}<div className="tool-actions"><button onClick={undo} disabled={!interventions.length||optimizing}>Undo</button><button onClick={reset}>Reset</button></div><button className="optimize-button" onClick={optimize} disabled={optimizing||mode==='explore'}><span>{optimizing?'SEARCHING CITY…':'OPTIMIZE WITH HEATRX'}</span><small>{optimizing?`accepted action ${optimizationStep}`:'same resource caps'}</small></button><p className="model-note">Engine: {engine==='api'?'FastAPI counterfactual search':'browser fallback'}. Reduced-order outputs require calibration before real-world claims.</p></aside>
      <section className="game-stage"><div className="stage-head"><div><small>SCENARIO</small><strong>{scenario.name}</strong></div><div className="wind-readout"><span>WIND</span><b>W → E</b><small>{scenario.windSpeed.toFixed(1)} m/s</small></div></div><div className="canvas-wrap"><ThermalCanvas scenario={scenario} result={displayResult} interventions={interventions} overlay={overlay} tool={tool} hover={hover} onHover={setHover} onPlace={place} pulse={pulse}/>{mode==='challenge'&&<div className="challenge-meter"><div><span>COOL THIS CITY</span><b>{result.metrics.exposure_reduction_pct.toFixed(1)} / {CHALLENGE_TARGET}%</b></div><i><em style={{width:`${challengeProgress}%`}}/></div>}<div className="canvas-legend"><span>LOW</span><i/><span>THERMAL LOAD</span><i/><span>HIGH</span></div>{optimizing&&<div className="search-overlay"><div className="search-line"><span>COUNTERFACTUAL SEARCH</span><b>ITERATION {String(optimizationStep+1).padStart(2,'0')}</b></div><div className="scan"/></div>}</div><div className="status-line"><span>{notice}</span><b>{preview?`PREVIEW ${pct(preview.metrics.exposure_reduction_pct-result.metrics.exposure_reduction_pct)} marginal exposure`:`${overlay.replace('_',' ').toUpperCase()} LENS`}</b></div></section>
      <aside className="inspector-panel"><div className="panel-heading"><span>Thermal fingerprint</span><small>{hover?`${hover.x}, ${hover.y}`:'HOVER A CELL'}</small></div>{hover&&inspected&&fp?<><div className="cell-title"><small>{inspected.land.toUpperCase()}</small><strong>{result.layers.temperature[hover.y][hover.x].toFixed(1)}°C</strong><span>{fp.dominant}</span></div><FingerprintRow label="Solar radiation" value={fp.radiation}/><FingerprintRow label="Heat storage" value={fp.heat_storage}/><FingerprintRow label="ET deficit" value={fp.et_deficit}/><FingerprintRow label="Ventilation block" value={fp.ventilation_restriction}/><div className="exposure-box"><span>HUMAN ACTIVITY WEIGHT</span><b>{Math.round(inspected.activity*100)}%</b><small>Cooling this cell matters more when more people are exposed.</small></div>{tool!=='inspect'&&<PlacementPreview valid={!occupied.has(`${hover.x}:${hover.y}`)&&isValidPlacement(scenario,tool,hover.x,hover.y)} tool={tool} current={result.metrics.exposure_reduction_pct} next={preview?.metrics.exposure_reduction_pct??null} land={inspected.land} airflowWarning={(tool==='tree'||tool==='green')&&inspected.ventilation>.68}/>}</>:<div className="inspector-empty"><span>Move across the block.</span><p>Every cell has a different physical reason for heating. The system diagnoses that before prescribing an intervention.</p></div>}{(manualScore!==null||optimizedScore!==null)&&<div className="duel-card"><span>HUMAN VS HEATRX</span><div><small>Your plan</small><b>{manualScore===null?'—':pct(manualScore)}</b></div><div><small>HeatRx plan</small><b>{optimizedScore===null?'searching…':pct(optimizedScore)}</b></div>{manualScore!==null&&optimizedScore!==null&&<p>{optimizedScore>manualScore?`${(optimizedScore-manualScore).toFixed(1)} percentage points more exposure removed under the same resource caps.`:'Your manual plan matched or beat this baseline search. Improve the optimizer, not the story.'}</p>}</div>}</aside>
    </section>
  </main>;
}

function Metric({label,value,sub,accent=false}:{label:string;value:string;sub:string;accent?:boolean}){return <div className={accent?'metric accent':'metric'}><small>{label}</small><strong>{value}</strong><span>{sub}</span></div>}
function FingerprintRow({label,value}:{label:string;value:number}){const v=Math.max(0,Math.min(100,value*100));return <div className="finger-row"><div><span>{label}</span><b>{Math.round(v)}%</b></div><i><em style={{width:`${v}%`}}/></i></div>}
function PlacementPreview({valid,tool,current,next,land,airflowWarning}:{valid:boolean;tool:InterventionType;current:number;next:number|null;land:string;airflowWarning:boolean}){const meta=TOOL_META[tool];return <div className={`placement-preview ${valid?'valid':'invalid'}`}><span>{valid?(airflowWarning?'TRADE-OFF DETECTED':'PLACEMENT PREVIEW'):'NOT RECOMMENDED'}</span><b>{valid?meta.label:`${meta.label} on ${land}`}</b>{valid&&next!==null?<><div><small>Marginal exposure effect</small><strong>{pct(next-current)}</strong></div><p>{airflowWarning?'High-flow corridor: cooling benefits are evaluated together with a downwind ventilation penalty. ':''}{meta.water?`${meta.water} L/day water · `:''}{money(meta.cost)} capital proxy</p></>:<p>{valid?'Move to a free cell to preview its modeled effect.':'This intervention is physically incompatible with the selected or occupied cell.'}</p>}</div>}
