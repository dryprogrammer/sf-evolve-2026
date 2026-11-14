import { Point, WORLD, walkable } from './world';
const cell=(p:Point)=>({x:Math.floor(p.x/WORLD.tile),y:Math.floor(p.y/WORLD.tile)});
const center=(c:Point)=>({x:c.x*WORLD.tile+WORLD.tile/2,y:c.y*WORLD.tile+WORLD.tile/2});
const key=(c:Point)=>`${c.x},${c.y}`;
/** Four-way tile BFS: small bounded map, deterministic shortest walkable route. */
export function routeTo(start:Point,target:Point):Point[]|null {
 if(!walkable(target))return null;
 const from=cell(start),goal=cell(target),queue:Point[]=[from],parents=new Map<string,Point|null>([[key(from),null]]);
 for(let i=0;i<queue.length;i++){
  const current=queue[i];
  if(key(current)===key(goal)){
   const route:Point[]=[];let c:Point|null=current;
   while(c&&key(c)!==key(from)){route.unshift(center(c));c=parents.get(key(c))??null;}
   route.push(target);return route;
  }
  for(const delta of [{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}]){
   const next={x:current.x+delta.x,y:current.y+delta.y};
   if(next.x<0||next.y<0||next.x>=WORLD.width/WORLD.tile||next.y>=WORLD.height/WORLD.tile||parents.has(key(next))||!walkable(center(next)))continue;
   parents.set(key(next),current);queue.push(next);
  }
 }
 return null;
}
