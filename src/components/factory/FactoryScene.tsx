'use client';
import { useEffect, useRef, useState } from 'react';
import type { FactoryView } from '@/lib/contracts';
import { drawFactory } from './render';
import { routeTo } from './navigation';
import { WORLD, SPAWN, STATIONS, nearbyStation, stationAt, walkable, type Point, type RemoteAvatar, type SceneState, type StationId } from './world';
export interface NavigationRequest { id:StationId; nonce:number; }
export interface PositionCorrection { point:Point; nonce:number; }
interface Props { view:FactoryView|null; request:NavigationRequest|null; onNearby:(id:StationId|null)=>void; onInspect:(id:StationId)=>void; paused:boolean;
 /** Shared-room extensions; omitted by the single-persona floor. */
 roomMode?:boolean; remotes?:{current:RemoteAvatar[]}; onPosition?:(point:Point,facing:SceneState['facing'])=>void; correction?:PositionCorrection|null; }
export default function FactoryScene(props:Props) {
 const canvas=useRef<HTMLCanvasElement>(null);
 const propsRef=useRef(props);propsRef.current=props;
 const position=useRef<Point>({...SPAWN}),path=useRef<Point[]>([]),keys=useRef(new Set<string>()),facing=useRef<SceneState['facing']>('down');
 const target=useRef<StationId|null>(null), near=useRef<StationId|null>(null);
 const [message,setMessage]=useState('Click an open aisle to walk. Approach a workcell to inspect it.');
 function travel(to:Point,id:StationId|null){
  const route=routeTo(position.current,to);
  if(!route){setMessage('That spot is blocked. Choose an open aisle or a workstation.');return;}
  path.current=route;target.current=id;keys.current.clear();
  setMessage(id?`Walking to ${STATIONS.find(s=>s.id===id)?.title}. Press E when you arrive.`:'Walking through the workshop.');canvas.current?.focus({preventScroll:true});
 }
 useEffect(()=>{ if(props.request){const station=STATIONS.find(s=>s.id===props.request?.id);if(station)travel(station.entry,station.id);} },[props.request]);
 useEffect(()=>{if(props.paused){keys.current.clear();path.current=[];}},[props.paused]);
 // Server-authoritative snap-back (blocked/rejected movement keeps the last accepted position).
 useEffect(()=>{if(props.correction){position.current={...props.correction.point};path.current=[];}},[props.correction]);
 const shown=useRef(new Map<string,Point>());
 useEffect(()=>{
  const element=canvas.current;const ctx=element?.getContext('2d');if(!element||!ctx)return;
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');let reduced=preference.matches;
  const changed=()=>{reduced=preference.matches;};preference.addEventListener('change',changed);
  let frame=0,last=performance.now();
  function update(now:number){
   const dt=Math.min((now-last)/1000,.05);last=now;
   const {view,paused}=propsRef.current;let dx=0,dy=0,moving=false;
   if(!paused){
    if(keys.current.has('arrowleft')||keys.current.has('a'))dx--;
    if(keys.current.has('arrowright')||keys.current.has('d'))dx++;
    if(keys.current.has('arrowup')||keys.current.has('w'))dy--;
    if(keys.current.has('arrowdown')||keys.current.has('s'))dy++;
    if(dx||dy){path.current=[];const len=Math.hypot(dx,dy);dx/=len;dy/=len;}
    else if(path.current.length){const waypoint=path.current[0],x=waypoint.x-position.current.x,y=waypoint.y-position.current.y,len=Math.hypot(x,y);if(len<5){position.current={...waypoint};path.current.shift();}else {dx=x/len;dy=y/len;}}
    if(dx||dy){const p=position.current,waypoint=path.current[0],step=Math.min(160*dt,waypoint?Math.hypot(waypoint.x-p.x,waypoint.y-p.y):Infinity);
     if(waypoint){const next={x:p.x+dx*step,y:p.y+dy*step};if(walkable(next)){p.x=next.x;p.y=next.y;moving=true;}else{path.current=[];setMessage('Route interrupted. Choose another open aisle.');}}
     else{const nx={x:p.x+dx*step,y:p.y};if(walkable(nx)){p.x=nx.x;moving=true;}const ny={x:p.x,y:p.y+dy*step};if(walkable(ny)){p.y=ny.y;moving=true;}}
     if(Math.abs(dx)>Math.abs(dy))facing.current=dx<0?'left':'right';else facing.current=dy<0?'up':'down';}
   }
   const nearest=nearbyStation(position.current)?.id??null;
   if(nearest!==near.current){near.current=nearest;propsRef.current.onNearby(nearest);if(nearest)setMessage(`${STATIONS.find(s=>s.id===nearest)?.title} nearby. Press E or Enter to inspect.`);}
   const round=view?.rounds.at(-1),hasAccess=!!view&&view.work.evidence.every(e=>e.permitted);
   const pending=round?.assignments.filter(a=>a.responsibility==='required'&&round.signoffs.filter(s=>s.assignmentId===a.id&&s.generation===a.generation).at(-1)?.outcome!=='approve').length??0;
   // Interpolate remote avatars toward their last accepted positions (snap under reduced motion).
   const remotes=(propsRef.current.remotes?.current??[]).map(r=>{const prev=shown.current.get(r.sessionId);const k=reduced||!prev?1:Math.min(1,dt*12);const p={x:prev?prev.x+(r.x-prev.x)*k:r.x,y:prev?prev.y+(r.y-prev.y)*k:r.y};shown.current.set(r.sessionId,p);return {...r,...p};});
   propsRef.current.onPosition?.(position.current,facing.current);
   drawFactory(ctx!,{roomMode:propsRef.current.roomMode,remotes,player:position.current,facing:facing.current,moving,time:now,reducedMotion:reduced,selected:target.current,destination:path.current.at(-1)??null,nearby:nearest,principalId:view?.principal.id??'maya',reviewState:hasAccess?(round?.state??'not_requested'):'unavailable',pending:hasAccess?pending:0,sourceAvailable:view?.work.sourceAvailable??false,hasAccess});
   element!.dataset.playerX=position.current.x.toFixed(1);element!.dataset.playerY=position.current.y.toFixed(1);element!.dataset.nearby=nearest??'';element!.dataset.reducedMotion=String(reduced);element!.dataset.remotes=String(remotes.filter(r=>r.connected).length);
   frame=requestAnimationFrame(update);
  }
  frame=requestAnimationFrame(update);
  const blur=()=>{keys.current.clear();};window.addEventListener('blur',blur);
  const visibility=()=>{keys.current.clear();last=performance.now();};document.addEventListener('visibilitychange',visibility);
  return()=>{cancelAnimationFrame(frame);preference.removeEventListener('change',changed);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',visibility);keys.current.clear();};
 },[]);
 function interact(){if(near.current)props.onInspect(near.current);else setMessage('Walk to a marked workcell first, or use Work inspector for direct access.');}
 function step(dx:number,dy:number){travel({x:position.current.x+dx*WORLD.tile,y:position.current.y+dy*WORLD.tile},null);}
 return <>
  <div className="scene-window">
   <canvas ref={canvas} width={WORLD.width} height={WORLD.height} tabIndex={0} role="application" aria-label="Walkable 2D sprite factory" aria-describedby="factory-controls" onBlur={()=>keys.current.clear()} onKeyDown={event=>{if(event.ctrlKey||event.metaKey||event.altKey)return;const key=event.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(key)){event.preventDefault();keys.current.add(key);}if(['e','enter'].includes(key)){event.preventDefault();if(!event.repeat)interact();}}} onKeyUp={event=>keys.current.delete(event.key.toLowerCase())} onPointerDown={event=>{const rect=event.currentTarget.getBoundingClientRect();const point={x:(event.clientX-rect.left)*WORLD.width/rect.width,y:(event.clientY-rect.top)*WORLD.height/rect.height};const station=stationAt(point);travel(station?.entry??point,station?.id??null);}} />
   <div className="scene-stamp"><i/><span>{props.roomMode?'DEMO SESSIONS · PRESENCE ONLY':'SIMULATED PRESENCE'}</span></div>
  </div>
  <div className="scene-controls" id="factory-controls"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / arrows to walk <b>·</b> <kbd>E</kbd> to inspect</span><span className="click-hint">or click a workstation <span aria-hidden="true">↗</span></span></div>
  <p className="sr-only" role="status">{message}</p>
  <div className="touch-controls" aria-label="Touch movement controls"><button aria-label="Walk left" onClick={()=>step(-1,0)}>←</button><button aria-label="Walk up" onClick={()=>step(0,-1)}>↑</button><button aria-label="Walk down" onClick={()=>step(0,1)}>↓</button><button aria-label="Walk right" onClick={()=>step(1,0)}>→</button><button onClick={interact}>Inspect nearby</button></div>
 </>;
}
