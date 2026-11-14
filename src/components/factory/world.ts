export const WORLD = { width:1152, height:704, tile:32 } as const;
export interface Point { x:number; y:number; }
export interface Rect extends Point { w:number; h:number; }
export type StationId = 'assembly'|'security'|'maintainability'|'growth'|'economics';
export interface Station { id:StationId; title:string; code:string; color:string; rect:Rect; entry:Point; description:string; }
export const STATIONS:Station[] = [
 {id:'assembly',title:'Assembly',code:'01',color:'#acbb7d',rect:{x:368,y:152,w:256,h:144},entry:{x:496,y:336},description:'Where work becomes a shared context. Inspect evidence, leave notes, and start a human review.'},
 {id:'security',title:'Security',code:'02',color:'#8ab5ae',rect:{x:864,y:144,w:176,h:152},entry:{x:944,y:336},description:'A dedicated perspective, not another vote. Required human sign-offs stay separate from agent advice.'},
 {id:'maintainability',title:'Maintainability',code:'03',color:'#c4a287',rect:{x:96,y:384,w:224,h:96},entry:{x:208,y:528},description:'Protect the work that came before. Read implementation evidence and preserve earlier concerns.'},
 {id:'growth',title:'Growth',code:'04',color:'#bea7bf',rect:{x:704,y:384,w:176,h:96},entry:{x:784,y:528},description:'A place for a different human perspective. This role station shares the fixture review, not a live growth team.'},
 {id:'economics',title:'Economics',code:'05',color:'#d3b775',rect:{x:928,y:392,w:128,h:96},entry:{x:1008,y:528},description:'Make trade-offs visible. This fixture role station opens the shared work inspector; it does not simulate real costs.'}
];
export const OBSTACLES:Rect[] = [...STATIONS.map(s=>s.rect),{x:80,y:112,w:192,h:96},{x:672,y:144,w:112,h:112},{x:48,y:568,w:112,h:80},{x:432,y:416,w:128,h:80}];
export const SPAWN:Point = {x:592,y:592};
export const BOUNDS = {x:64,y:96,w:1024,h:560};
export function walkable(p:Point):boolean {
 if(p.x<BOUNDS.x+10||p.x>BOUNDS.x+BOUNDS.w-10||p.y<BOUNDS.y+10||p.y>BOUNDS.y+BOUNDS.h-10)return false;
 return !OBSTACLES.some(r=>p.x>r.x-10&&p.x<r.x+r.w+10&&p.y>r.y-10&&p.y<r.y+r.h+10);
}
export function nearbyStation(p:Point):Station|null {return STATIONS.find(s=>Math.hypot(s.entry.x-p.x,s.entry.y-p.y)<72)??null;}
export function stationAt(p:Point):Station|null {return STATIONS.find(s=>p.x>=s.rect.x-10&&p.x<=s.rect.x+s.rect.w+10&&p.y>=s.rect.y-40&&p.y<=s.rect.y+s.rect.h+28)??null;}
export interface SceneState { player:Point; facing:'down'|'up'|'left'|'right'; moving:boolean; time:number; reducedMotion:boolean; selected:StationId|null; destination:Point|null; nearby:StationId|null; principalId:string; reviewState:string; pending:number; sourceAvailable:boolean; hasAccess:boolean; }
