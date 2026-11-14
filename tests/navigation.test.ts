import { describe, expect, it } from 'vitest';
import { routeTo } from '../src/components/factory/navigation';
import { BOUNDS, OBSTACLES, SPAWN, STATIONS, nearbyStation, stationAt, walkable, type Point } from '../src/components/factory/world';
function verifyRoute(start:Point, target:Point){
 const route=routeTo(start,target);expect(route).not.toBeNull();expect(route!.at(-1)).toEqual(target);
 let previous=start;
 for(const point of route!){expect(walkable(point)).toBe(true);const steps=Math.ceil(Math.hypot(point.x-previous.x,point.y-previous.y));for(let n=1;n<=steps;n++)expect(walkable({x:previous.x+(point.x-previous.x)*n/steps,y:previous.y+(point.y-previous.y)*n/steps})).toBe(true);previous=point;}
 return route;
}
describe('factory navigation',()=>{
 it('reaches every station from spawn and every other station with collision-safe routes',()=>{for(const station of STATIONS){verifyRoute(SPAWN,station.entry);for(const other of STATIONS)verifyRoute(station.entry,other.entry);}});
 it('routes from off-grid positions and reaches open furniture-edge destinations',()=>{for(const point of [{x:634,y:302},{x:358,y:306},{x:322,y:494},{x:570,y:410}]){expect(walkable(point)).toBe(true);verifyRoute(point,SPAWN);verifyRoute(SPAWN,point);for(const station of STATIONS)verifyRoute(point,station.entry);}});
 it('is deterministic and rejects furniture and destinations beyond the floor',()=>{expect(routeTo(SPAWN,STATIONS[0].entry)).toEqual(routeTo(SPAWN,STATIONS[0].entry));for(const r of OBSTACLES)expect(routeTo(SPAWN,{x:r.x+r.w/2,y:r.y+r.h/2})).toBeNull();for(const point of [{x:0,y:0},{x:BOUNDS.x-1,y:SPAWN.y},{x:1152,y:SPAWN.y},{x:SPAWN.x,y:704}])expect(routeTo(SPAWN,point)).toBeNull();});
 it('keeps avatar clearance around furniture and bounds',()=>{expect(walkable(SPAWN)).toBe(true);expect(walkable({x:BOUNDS.x+9,y:SPAWN.y})).toBe(false);expect(walkable({x:STATIONS[0].rect.x-9,y:200})).toBe(false);});
 it('identifies workstation hits and proximity without granting authority',()=>{expect(nearbyStation(SPAWN)).toBeNull();for(const s of STATIONS){expect(nearbyStation(s.entry)?.id).toBe(s.id);expect(stationAt({x:s.rect.x+20,y:s.rect.y+20})?.id).toBe(s.id);}expect(stationAt(SPAWN)).toBeNull();});
});
