import { Point, WORLD, walkable } from './world';
const cell=(p:Point)=>({x:Math.floor(p.x/WORLD.tile),y:Math.floor(p.y/WORLD.tile)});
const center=(c:Point)=>({x:c.x*WORLD.tile+WORLD.tile/2,y:c.y*WORLD.tile+WORLD.tile/2});
const key=(c:Point)=>`${c.x},${c.y}`;
/** Check edges too: walkable endpoints alone can cut an inflated furniture corner. */
function clearSegment(from:Point,to:Point):boolean {
 const steps=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)));
 for(let i=0;i<=steps;i++)if(!walkable({x:from.x+(to.x-from.x)*i/steps,y:from.y+(to.y-from.y)*i/steps}))return false;
 return true;
}
/** Bounded deterministic BFS, with safe off-grid connections at both ends. */
export function routeTo(start:Point,target:Point):Point[]|null {
 if(![start.x,start.y,target.x,target.y].every(Number.isFinite)||!walkable(start)||!walkable(target))return null;
 if(Math.hypot(target.x-start.x,target.y-start.y)<=WORLD.tile&&clearSegment(start,target))return [target];
 const from=cell(start),queue:Point[]=[],parents=new Map<string,Point|null>();
 // A keyboard stop may share a tile with a blocked center. Connect to nearby
 // visible centers instead of assuming the current tile center is reachable.
 const seeds:Point[]=[];
 for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)seeds.push({x:from.x+x,y:from.y+y});
 seeds.sort((a,b)=>Math.hypot(center(a).x-start.x,center(a).y-start.y)-Math.hypot(center(b).x-start.x,center(b).y-start.y));
 for(const seed of seeds)if(clearSegment(start,center(seed))){queue.push(seed);parents.set(key(seed),null);}
 for(let i=0;i<queue.length;i++){
  const current=queue[i],point=center(current);
  // Open edge destinations need not have a walkable tile center themselves.
  if(Math.hypot(point.x-target.x,point.y-target.y)<=WORLD.tile*1.5&&clearSegment(point,target)){
   const route:Point[]=[];let c:Point|null=current;
   while(c){route.unshift(center(c));c=parents.get(key(c))??null;}
   if(route[0]?.x===start.x&&route[0]?.y===start.y)route.shift();
   if(route.at(-1)?.x!==target.x||route.at(-1)?.y!==target.y)route.push(target);
   return route;
  }
  for(const delta of [{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}]){
   const next={x:current.x+delta.x,y:current.y+delta.y};
   if(next.x<0||next.y<0||next.x>=WORLD.width/WORLD.tile||next.y>=WORLD.height/WORLD.tile||parents.has(key(next))||!clearSegment(point,center(next)))continue;
   parents.set(key(next),current);queue.push(next);
  }
 }
 return null;
}
