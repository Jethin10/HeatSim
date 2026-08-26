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

const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;

function color(v:number,overlay:Overlay){
  if(overlay==='ventilation'){
    const t=clamp(v);return `rgb(${Math.round(72-28*t)},${Math.round(96+110*t)},${Math.round(135+90*t)})`;
  }
  const t=overlay==='temperature'?clamp((v-36)/9):overlay==='exposure'?clamp(v/10):clamp(v);
  const s=[[33,94,67],[79,135,75],[201,166,56],[221,111,43],[193,55,42],[126,28,28]];
  const p=t*(s.length-1),i=Math.min(s.length-2,Math.floor(p)),f=p-i,a=s[i],b=s[i+1];
  return `rgb(${Math.round(lerp(a[0],b[0],f))},${Math.round(lerp(a[1],b[1],f))},${Math.round(lerp(a[2],b[2],f))})`;
}

function icon(ctx:CanvasRenderingContext2D,type:Intervention['type'],cx:number,cy:number,s:number,alpha=1){
  ctx.save();ctx.globalAlpha=alpha;ctx.lineWidth=Math.max(1,s*.08);
  if(type==='tree'){
    ctx.fillStyle='#84b47a';ctx.beginPath();ctx.arc(cx,cy-s*.06,s*.26,0,Math.PI*2);ctx.fill();ctx.fillStyle='#463a2b';ctx.fillRect(cx-s*.035,cy+s*.13,s*.07,s*.22);
  }else if(type==='green'){
    ctx.fillStyle='#6f9f67';ctx.fillRect(cx-s*.28,cy-s*.22,s*.56,s*.44);ctx.strokeStyle='#b7d5ad';ctx.beginPath();ctx.moveTo(cx-s*.18,cy+s*.1);ctx.lineTo(cx+s*.16,cy-s*.12);ctx.stroke();
  }else if(type==='water'){
    ctx.fillStyle='#4d8b9a';ctx.beginPath();ctx.ellipse(cx,cy,s*.34,s*.23,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#9cc5cb';ctx.beginPath();ctx.arc(cx,cy-s*.03,s*.17,.15,Math.PI-.15);ctx.stroke();
  }else if(type==='roof'){
    ctx.fillStyle='#d8dfdc';ctx.fillRect(cx-s*.31,cy-s*.23,s*.62,s*.46);ctx.strokeStyle='#fff';ctx.strokeRect(cx-s*.31,cy-s*.23,s*.62,s*.46);
  }else{
    ctx.fillStyle='#b9c0bb';ctx.fillRect(cx-s*.32,cy-s*.16,s*.64,s*.32);ctx.strokeStyle='#e5e7e5';for(let k=-1;k<=1;k++){ctx.beginPath();ctx.moveTo(cx-s*.27,cy+k*s*.09);ctx.lineTo(cx+s*.27,cy+k*s*.09);ctx.stroke();}
  }
  ctx.restore();
}

export default function ThermalCanvas(p:Props){
  const ref=useRef<HTMLCanvasElement>(null),prev=useRef<SimulationResult|null>(null),latest=useRef(p.result),transition=useRef(0);
  useEffect(()=>{prev.current=latest.current;latest.current=p.result;transition.current=performance.now();},[p.result]);

  useEffect(()=>{
    const canvas=ref.current;if(!canvas)return;let raf=0;
    const mini=document.createElement('canvas');mini.width=p.scenario.width;mini.height=p.scenario.height;const m=mini.getContext('2d');if(!m)return;
    const draw=(now:number)=>{
      const r=canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1),pw=Math.max(1,Math.floor(r.width*dpr)),ph=Math.max(1,Math.floor(r.height*dpr));
      if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;}
      const ctx=canvas.getContext('2d');if(!ctx)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,r.width,r.height);ctx.fillStyle='#101311';ctx.fillRect(0,0,r.width,r.height);
      const margin=24,cs=Math.min((r.width-margin*2)/p.scenario.width,(r.height-margin*2)/p.scenario.height),mw=cs*p.scenario.width,mh=cs*p.scenario.height,ox=(r.width-mw)/2,oy=(r.height-mh)/2;

      for(const c of p.scenario.cells){const x=ox+c.x*cs,y=oy+c.y*cs;ctx.fillStyle=c.land==='building'?'#262b28':c.land==='road'?'#1b1f1d':c.land==='vegetation'?'#263b2c':'#202521';ctx.fillRect(x,y,cs+.5,cs+.5);}
      const old=prev.current||p.result,b=clamp((now-transition.current)/680),layer=p.result.layers[p.overlay],oldLayer=old.layers[p.overlay]||layer;m.clearRect(0,0,mini.width,mini.height);
      for(let y=0;y<p.scenario.height;y++)for(let x=0;x<p.scenario.width;x++){m.fillStyle=color(lerp(oldLayer[y]?.[x]??layer[y][x],layer[y][x],b),p.overlay);m.fillRect(x,y,1,1);}
      ctx.save();ctx.globalAlpha=p.overlay==='ventilation'?.42:.58;ctx.imageSmoothingEnabled=true;ctx.filter=`blur(${Math.max(3,cs*.38)}px)`;ctx.drawImage(mini,ox-cs*.2,oy-cs*.2,mw+cs*.4,mh+cs*.4);ctx.restore();

      for(const c of p.scenario.cells)if(c.land==='building'){const x=ox+c.x*cs,y=oy+c.y*cs;ctx.fillStyle='rgba(20,24,22,.48)';ctx.fillRect(x+cs*.08,y+cs*.08,cs*.84,cs*.84);ctx.strokeStyle='rgba(235,239,236,.18)';ctx.strokeRect(x+cs*.08,y+cs*.08,cs*.84,cs*.84);}
      if(p.overlay==='exposure')for(const c of p.scenario.cells)if(c.activity>.72){ctx.fillStyle=`rgba(255,255,255,${.04+.08*c.activity})`;ctx.beginPath();ctx.arc(ox+(c.x+.5)*cs,oy+(c.y+.5)*cs,Math.max(1.2,cs*.12),0,Math.PI*2);ctx.fill();}
      if(p.overlay==='ventilation'){ctx.strokeStyle='rgba(210,238,235,.38)';for(let n=0;n<18;n++){const yy=oy+((n+.45)/18)*mh,q=((now*.035+n*37)%(mw+80))-40;ctx.beginPath();ctx.moveTo(ox+q,yy);ctx.lineTo(ox+q+28,yy);ctx.stroke();}}
      for(const item of p.interventions)icon(ctx,item.type,ox+(item.x+.5)*cs,oy+(item.y+.5)*cs,cs*.95);
      if(p.hover){const x=ox+p.hover.x*cs,y=oy+p.hover.y*cs,valid=p.tool==='inspect'||isValidPlacement(p.scenario,p.tool,p.hover.x,p.hover.y);ctx.strokeStyle=valid?'rgba(245,247,245,.95)':'rgba(232,92,70,.95)';ctx.lineWidth=1.5;ctx.strokeRect(x+1,y+1,cs-2,cs-2);if(p.tool!=='inspect')icon(ctx,p.tool,x+cs*.5,y+cs*.5,cs*.95,valid?.68:.25);}
      if(p.pulse){const age=(now-p.pulse.at)/900;if(age>=0&&age<1){ctx.strokeStyle=`rgba(235,241,236,${1-age})`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(ox+(p.pulse.x+.5)*cs,oy+(p.pulse.y+.5)*cs,cs*(.4+2.7*age),0,Math.PI*2);ctx.stroke();}}
      ctx.strokeStyle='rgba(237,241,238,.17)';ctx.lineWidth=1;ctx.strokeRect(ox,oy,mw,mh);raf=requestAnimationFrame(draw);
    };
    raf=requestAnimationFrame(draw);return()=>cancelAnimationFrame(raf);
  },[p.scenario,p.result,p.interventions,p.overlay,p.tool,p.hover,p.pulse]);

  const locate=(e:React.PointerEvent<HTMLCanvasElement>)=>{const r=e.currentTarget.getBoundingClientRect(),margin=24,cs=Math.min((r.width-margin*2)/p.scenario.width,(r.height-margin*2)/p.scenario.height),mw=cs*p.scenario.width,mh=cs*p.scenario.height,ox=(r.width-mw)/2,oy=(r.height-mh)/2,x=Math.floor((e.clientX-r.left-ox)/cs),y=Math.floor((e.clientY-r.top-oy)/cs);return x>=0&&y>=0&&x<p.scenario.width&&y<p.scenario.height?{x,y}:null;};
  return <canvas ref={ref} className="thermal-canvas" onPointerMove={e=>p.onHover(locate(e))} onPointerLeave={()=>p.onHover(null)} onPointerDown={e=>{const c=locate(e);if(c)p.onPlace(c.x,c.y)}} aria-label="Interactive urban thermal simulation map"/>;
}
