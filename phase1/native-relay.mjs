// Trusted workspace collector ingress, not a vendor API or independent provenance verifier.
const id=value=>typeof value==='string'&&value.length>0&&value.length<=200;
export function validateNativeBatch(input,scope){
 if(!scope||input?.projectId!==scope.projectId||!Array.isArray(scope.conversationIds)||!scope.conversationIds.includes(input.conversationId))throw Error('Native capture scope denied');
 if(!Array.isArray(input.frames)||input.frames.length>128)throw Error('Expected at most 128 filtered frames');
 return input.frames.map(e=>{
  if(!e||!['content','status','done','steer_message','user_message','queue_state'].includes(e.type)||
   !id(e.requestId)||typeof e.receivedAt!=='string'||!Number.isFinite(Date.parse(e.receivedAt))||
   !['incremental','buffered-at-attach'].includes(e.delivery)||typeof e.beforeResponseFinished!=='boolean'||
   (e.eventId!==null&&!id(e.eventId))||(e.turnId!==null&&!id(e.turnId)))throw Error('Invalid filtered native frame');
  const frame={type:e.type,eventId:e.eventId,requestId:e.requestId,receivedAt:e.receivedAt,delivery:e.delivery,
   beforeResponseFinished:e.beforeResponseFinished,turnId:e.turnId};
  if(e.type==='content'){
   if(!id(e.turnId)||!id(e.messageId)||!id(e.partId)||!Number.isSafeInteger(e.offset)||e.offset<0||
    typeof e.delta!=='string'||e.delta.length>65536)throw Error('Invalid model content shape');
   Object.assign(frame,{messageId:e.messageId,partId:e.partId,offset:e.offset,delta:e.delta,sourceAt:null});
  }else if(e.type==='status'){
   if(typeof e.isStreaming!=='boolean'||(e.stateRevision!==null&&!id(e.stateRevision)))throw Error('Invalid source status');
   Object.assign(frame,{isStreaming:e.isStreaming,stateRevision:e.stateRevision});
  }else if(e.type==='done')frame.finishReason=typeof e.finishReason==='string'?e.finishReason.slice(0,100):null;
  else if(e.type==='queue_state'){
   if(!Array.isArray(e.entryIds)||e.entryIds.length>256||!e.entryIds.every(id))throw Error('Invalid source queue');
   Object.assign(frame,{entryIds:e.entryIds,stateRevision:id(e.stateRevision)?e.stateRevision:null});
  }else{if(!id(e.inputId))throw Error('Invalid source input ID');frame.inputId=e.inputId;}
  return frame;
 });
}
export class NativeRelay {
 constructor({emit}){this.emit=emit;this.parts=new Map();this.states=new Map();this.seen=new Set();
  this.metrics={frames:0,duplicates:0,gaps:0,parts:0,delivery:'scoped native CDP relay; source time unknown; trusted workspace collector'};}
 accept(input,scope){
  const frames=validateNativeBatch(input,scope);const updatedParts=new Map(); // Entire batch validated before any dispatch.
  for(const e of frames){
   const key=input.conversationId+'\0'+(e.eventId??JSON.stringify(e));
   if(this.seen.has(key)){this.metrics.duplicates++;continue;}
   this.seen.add(key);if(this.seen.size>10000)this.seen.delete(this.seen.values().next().value);
   this.metrics.frames++;
   const common={source:'native-browser-cdp',agent:input.conversationId,sourceAt:null,
    historical:e.delivery==='buffered-at-attach'};
   if(e.type==='content'){
    const partKey=[input.conversationId,e.turnId,e.messageId,e.partId].join(':');
    let part=this.parts.get(partKey);
    if(!part){part={conversationId:input.conversationId,turnId:e.turnId,messageId:e.messageId,partId:e.partId,
     text:'',nextOffset:e.offset,gap:e.offset!==0};this.parts.set(partKey,part);}
    const overlap=part.nextOffset-e.offset;
    if(overlap<0|| (overlap>0&&part.text.slice(-overlap)!==e.delta.slice(0,overlap))){part.gap=true;this.metrics.gaps++;}
    else{
     const addition=e.delta.slice(Math.max(0,overlap));
     if(part.text.length+addition.length<=262144){part.text+=addition;part.nextOffset+=addition.length;}
     else{part.gap=true;this.metrics.gaps++;}
    }
    Object.assign(part,{wireReceivedAt:e.receivedAt,delivery:e.delivery});
    if(this.parts.size>100)this.parts.delete(this.parts.keys().next().value);
    this.metrics.parts=this.parts.size;
    this.emit({...common,type:'native.content',summary:'Native user-visible delta',payload:e});
    updatedParts.set(partKey,{...common,type:'assistant.native.part',summary:'Native model text · provisional projection',payload:{...part,frame:e,
     provenance:'Trusted scoped collector; source browser authentication verified separately',generationTimestamp:null}});
   }else{
    if(e.type==='status')this.states.set(input.conversationId,{conversationId:input.conversationId,
     turnId:e.turnId,sourceReportedRunning:e.isStreaming,observedAt:e.receivedAt,stateRevision:e.stateRevision,
     reconciled:false});
    // done/input/queue are source observations, not proof of final reconciliation, compliance or source authority.
    this.emit({...common,type:'native.'+e.type,summary:'Native source observation',payload:e});
   }
  }
  for(const event of updatedParts.values())this.emit(event);
  return {accepted:frames.length,retainedParts:this.parts.size};
 }
 snapshots(){return {states:[...this.states.values()],parts:[...this.parts.values()]};}
}
