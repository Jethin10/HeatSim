'use client';

import { useMemo, useState } from 'react';

type Tool = 'inspect'|'tree'|'water'|'roof'|'pavement';
type Cell = { base:number; delta:number; intervention?:Tool };
const N=18;

export default function Home(){
 const initial=useMemo(()=>Array.from({length:N*N},(_,i)=>({base:38+5*Math.exp(-(((i%N)-10)**2+(Math.floor(i/N)-8)**2)/35),delta:0} as Cell)),[]);
 const [cells,setCells]=useState(initial); const [tool,setTool]=useState<Tool>('tree'); const [budget,setBudget]=useState(3000000); const [water,setWater]=useState(8000);
 const place=(idx:number)=>{ if(tool==='inspect') return; const costs={tree:40000,water:500000,roof:200000,pavement:100000}; const cooling={tree:1.8,water:2.4,roof:1.4,pavement:1.0}; const c=costs[tool]; if(budget<c)return; const x=idx%N,y=Math.floor(idx/N); setCells(old=>old.map((v,j)=>{const dx=j%N-x,dy=Math.floor(j/N)-y,d=Math.sqrt(dx*dx+dy*dy); return {...v,delta:v.delta-(cooling[tool]*Math.exp(-d/2.8)),intervention:j===idx?tool:v.intervention};})); setBudget(b=>b-c); if(tool==='tree')setWater(w=>Math.max(0,w-220)); if(tool==='water')setWater(w=>Math.max(0,w-700)); };
 const avg=cells.reduce((s,c)=>s+c.base+c.delta,0)/cells.length; const exposure=Math.max(0,100-(42-avg)*7);
 const optimize=()=>{ setCells(old=>old.map((v,j)=>{const x=j%N,y=Math.floor(j/N);const d1=Math.hypot(x-10,y-8),d2=Math.hypot(x-6,y-11);return {...v,delta:v.delta-2.8*Math.exp(-d1/3.5)-1.8*Math.exp(-d2/3)};})); };
 return <main>
  <header><div><b>HEATRX</b><span>URBAN COOLING SIMULATOR</span></div><nav>{['THERMAL','RADIATION','STORAGE','AIRFLOW','EXPOSURE'].map(x=><button key={x}>{x}</button>)}</nav></header>
  <section className="stats"><div><small>BUDGET</small><strong>₹{(budget/100000).toFixed(1)}L</strong></div><div><small>WATER LEFT</small><strong>{water.toLocaleString()} L/day</strong></div><div><small>AVG. SURFACE</small><strong>{avg.toFixed(1)}°C</strong></div><div><small>EXPOSURE INDEX</small><strong>{exposure.toFixed(1)}</strong></div></section>
  <div className="workspace"><aside><p>INTERVENTIONS</p>{(['inspect','tree','water','roof','pavement'] as Tool[]).map(t=><button className={tool===t?'active':''} onClick={()=>setTool(t)} key={t}>{t.toUpperCase()}</button>)}<hr/><button className="opt" onClick={optimize}>OPTIMIZE WITH HEATRX</button></aside>
  <div className="map">{cells.map((c,i)=>{const t=c.base+c.delta;const hue=Math.max(0,Math.min(120,(44-t)*24));return <button key={i} onClick={()=>place(i)} title={`${t.toFixed(1)}°C`} style={{background:`hsl(${hue} 72% 48%)`}}>{c.intervention==='tree'?'♣':c.intervention==='water'?'≈':c.intervention==='roof'?'□':c.intervention==='pavement'?'▦':''}</button>})}</div>
  <aside className="info"><p>MISSION</p><h2>Cool this block.</h2><span>Place interventions under real resource constraints. The thermal field responds spatially, not tile-by-tile.</span><div className="legend"><i/> HIGH HEAT <i/> LOW HEAT</div></aside></div>
  <footer>PLACE AN INTERVENTION → WATCH THE FIELD RESPOND → LET HEATRX SEARCH FOR A BETTER PLAN</footer>
 </main>
}
