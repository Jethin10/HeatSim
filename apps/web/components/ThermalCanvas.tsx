'use client';

import { useEffect, useRef } from 'react';
import type { Intervention, Overlay, Scenario, SimulationResult, Tool } from '../lib/types';
import { isValidPlacement } from '../lib/simulation';

type Point = { x: number; y: number };
type Props = {
  scenario: Scenario;
  result: SimulationResult;
  interventions: Intervention[];
  overlay: Overlay;
  tool: Tool;
  hover: Point | null;
  onHover: (cell: Point | null) => void;
  onPlace: (x: number, y: number) => void;
  pulse: (Point & { at: number }) | null;
};

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function heatColor(v: number, overlay: Overlay) {
  let t = 0;
  if (overlay === 'temperature') t = clamp((v - 36) / 9);
  else if (overlay === 'exposure') t = clamp(v / 10);
  else if (overlay === 'ventilation') {
    const x = clamp(v);
    return `rgb(${Math.round(44 + 28 * (1 - x))},${Math.round(86 + 120 * x)},${Math.round(120 + 105 * x)})`;
  } else t = clamp(v);
  const stops = [[33,94,67],[79,135,75],[201,166,56],[221,111,43],[193,55,42],[126,28,28]];
  const p=t*(stops.length-1), i=Math.min(stops.length-2,Math.floor(p)), f=p-i, c=stops[i], d=stops[i+1];
  return `rgb(${Math.round(mix(c[0],d[0],f))},${Math.round(mix(c[1],d[1],f))},${Math.round(mix(c[2],d[2],f))})`;
}

function drawIntervention(ctx: CanvasRenderingContext2D, type: Intervention['type'], cx: number, cy: number, s: number, alpha=1) {
  ctx.save(); ctx.globalAlpha=alpha; ctx.lineWidth=Math.max(1,s*.08);
  if(type==='tree'){
    ctx.fillStyle='#84b47a';ctx.beginPath();ctx.arc(cx,cy-s*.06,s*.26,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#463a2b';ctx.fillRect(cx-s*.035,cy+s*.13,s*.07,s*.22);
  }else if(type==='green'){
    ctx.fillStyle='#6f9f67';ctx.fillRect(cx-s*.28,cy-s*.22,s*.56,s*.44);
    ctx.strokeStyle='#b7d5ad';ctx.beginPath();ctx.moveTo(cx-s*.18,cy+s*.1);ctx.lineTo(cx+s*.16,cy-s*.12);ctx.stroke();
  }else if(type==='water'){
    ctx.fillStyle='#4d8b9a';ctx.beginPath();ctx.ellipse(cx,cy,s*.34,s*.23,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#9cc5cb';ctx.beginPath();ctx.arc(cx,cy-s*.03,s*.17,.15,Math.PI-.15);ctx.stroke();
  }else if(type==='roof'){
    ctx.fillStyle='#d8dfdc';ctx.fillRect(cx-s*.31,cy-s*.23,s*.62,s*.46);ctx.strokeStyle='#fff';ctx.strokeRect(cx-s*.31,cy-s*.23,s*.62,s*.46);
  }else{
    ctx.fillStyle='#b9c0bb';ctx.fillRect(cx-s*.32,cy-s*.16,s*.64,s*.32);ctx.strokeStyle='#e5e7e5';
    for(let k=-1;k<=1;k++){ctx.beginPath();ctx.moveTo(cx-s*.27,cy+k*s*.09);ctx.lineTo(cx+s*.27,cy+k*s*.09);ctx.stroke();}
  }
  ctx.restore();
}

export default function ThermalCanvas(props: Props) {
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const previousRef=useRef<SimulationResult|null>(null);
  const resultRef=useRef(props.result);
  const transitionRef=useRef(0);

  useEffect(()=>{
    previousRef.current=resultRef.current;
    resultRef.current=props.result;
    transitionRef.current=performance.now();
  },[props.result]);

  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const heatMap=document.createElement('canvas');heatMap.width=props.scenario.width;heatMap.height=props.scenario.height;
    const heatCtx=heatMap.getContext('2d');if(!heatCtx)return;
    let raf=0;
    const draw=(now:number)=>{
      const rect=canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);
      const pxW=Math.max(1,Math.floor(rect.width*dpr)),pxH=Math.max(1,Math.floor(rect.height*dpr));
      if(canvas.width!==pxW||canvas.height!==pxH){canvas.width=pxW;canvas.height=pxH;}
      const ctx=canvas.getContext('2d');if(!ctx)return;
      ctx.setTransform(dpr,0,0,dpr,0,0);const W=rect.width,H=rect.height;ctx.clearRect(0,0,W,H);ctx.fillStyle='#101311';ctx.fillRect(0,0,W,H);
      const margin=24,cell=Math.min((W-margin*2)/props.scenario.width,(H-margin*2)/props.scenario.height);
      const mapW=cell*props.scenario.width,mapH=cell*props.scenario.height,ox=(W-mapW)/2,oy=(H-mapH)/2;

      for(const c of props.scenario.cells){
        const x=ox+c.x*cell,y=oy+c.y*cell;
        ctx.fillStyle=c.land==='building'?'#262b28':c.land==='road'?'#1b1f1d':c.land==='vegetation'?'#263b2c':'#202521';ctx.fillRect(x,y,cell+.5,cell+.5);
        if(c.land==='road'&&[7,8,9,18,19].includes(c.y)){ctx.strokeStyle='rgba(225,231,226,.10)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y+cell*.5);ctx.lineTo(x+cell,y+cell*.5);ctx.stroke();}
      }

      const old=previousRef.current||props.result,blend=clamp((now-transitionRef.current)/680),layer=props.result.layers[props.overlay],oldLayer=old.layers[props.overlay]||layer;
      heatCtx.clearRect(0,0,heatMap.width,heatMap.height);
      for(let y=0;y<props.scenario.height;y++)for(let x=0;x<props.scenario.width;x++){
        const v=mix(oldLayer[y]?.[x]??layer[y][x],layer[y][x],blend);heatCtx.fillStyle=heatColor(v,props.overlay);heatCtx.fillRect(x,y,1,1);
      }
      ctx.save();ctx.globalAlpha=props.overlay==='ventilation'?.42:.58;ctx.imageSmoothingEnabled=true;ctx.filter=`blur(${Math.max(3,cell*.38)}px)`;ctx.drawImage(heatMap,ox-cell*.2,oy-cell*.2,mapW+cell*.4,mapH+cell*.4);ctx.restore();

      for(const c of props.scenario.cells){if(c.land!=='building')continue;const x=ox+c.x*cell,y=oy+c.y*cell;ctx.fillStyle='rgba(20,24,22,.48)';ctx.fillRect(x+cell*.08,y+cell*.08,cell*.84,cell*.84);ctx.strokeStyle='rgba(235,239,236,.18)';ctx.lineWidth=1;ctx.strokeRect(x+cell*.08,y+cell*.08,cell*.84,cell*.84);}
      if(props.overlay==='exposure')for(const c of props.scenario.cells)if(c.activity>.72){const x=ox+(c.x+.5)*cell,y=oy+(c.y+.5)*cell;ctx.fillStyle=`rgba(255,255,255,${.04+.08*c.activity})`;ctx.beginPath();ctx.arc(x,y,Math.max(1.2,cell*.12),0,Math.PI*2);ctx.fill();}
      if(props.overlay==='ventilation'){ctx.strokeStyle='rgba(210,238,235,.38)';ctx.lineWidth=1;for(let n=0;n<18;n++){const yy=oy+((n+.45)/18)*mapH,phase=((now*.035+n*37)%(mapW+80))-40;ctx.beginPath();ctx.moveTo(ox+phase,yy);ctx.lineTo(ox+phase+28,yy);ctx.stroke();}}
      for(const item of props.interventions)drawIntervention(ctx,item.type,ox+(item.x+.5)*cell,oy+(item.y+.5)*cell,cell*.95);
      if(props.hover){const x=ox+props.hover.x*cell,y=oy+props.hover.y*cell,valid=props.tool==='inspect'||isValidPlacement(props.scenario,props.tool,props.hover.x,props.hover.y);ctx.strokeStyle=valid?'rgba(245,247,245,.95)':'rgba(232,92,70,.95)';ctx.lineWidth=1.5;ctx.strokeRect(x+1,y+1,cell-2,cell-2);if(props.tool!=='inspect')drawIntervention(ctx,props.tool,x+cell*.5,y+cell*.5,cell*.95,valid?.68:.25);}
      if(props.pulse){const age=(now-props.pulse.at)/900;if(age>=0&&age<1){ctx.strokeStyle=`rgba(235,241,236,${1-age})`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(ox+(props.pulse.x+.5)*cell,oy+(props.pulse.y+.5)*cell,cell*(.4+2.7*age),0,Math.PI*2);ctx.stroke();}}
      ctx.strokeStyle='rgba(237,241,238,.17)';ctx.lineWidth=1;ctx.strokeRect(ox,oy,mapW,mapH);raf=requestAnimationFrame(draw);
    };
    raf=requestAnimationFrame(draw);return()=>cancelAnimationFrame(raf);
  },[props.scenario,props.result,props.interventions,props.overlay,props.tool,props.hover,props.pulse]);

  const locate=(e:React.PointerEvent<HTMLCanvasElement>)=>{
    const rect=e.currentTarget.getBoundingClientRect(),margin=24,cell=Math.min((rect.width-margin*2)/props.scenario.width,(rect.height-margin*2)/props.scenario.height),mapW=cell*props.scenario.width,mapH=cell*props.scenario.height,ox=(rect.width-mapW)/2,oy=(rect.height-mapH)/2;
    const x=Math.floor((e.clientX-rect.left-ox)/cell),y=Math.floor((e.clientY-rect.top-oy)/cell);return x>=0&&y>=0&&x<props.scenario.width&&y<props.scenario.height?{x,y}:null;
  };
  return <canvas ref={canvasRef} className="thermal-canvas" onPointerMove={e=>props.onHover(locate(e))} onPointerLeave={()=>props.onHover(null)} onPointerDown={e=>{const c=locate(e);if(c)props.onPlace(c.x,c.y)}} aria-label="Interactive urban thermal simulation map"/>;
}
