async (page, options = {}) => {
  // Standalone browser_run_code function: no Node globals, credentials or duplicate API fetch.
  const url = await page.url();
  const match = url.match(/\/project\/([^/]+)\/agents\/([^/?#]+)/);
  if (!url.startsWith('https://factory.8090.ai/project/') || !match) throw new Error('Open the authorized conversation before capturing');
  const [, projectId, conversationId] = match;
  const endpoint = `https://api.factory.8090.dev/v2/project/${projectId}/agents/chat-agent/stream`;
  const session = await page.context().newCDPSession(page);
  const streams = new Map(), tasks = new Set();
  const result = {projectId, conversationId, startedAt:new Date().toISOString(),
    delivery:options.relay?'native CDP relay during bounded capture; result exported after window':'bounded native CDP capture; result delivered after window ends',
    requests:[], frames:[], incrementalChunks:0, droppedFrames:0, errors:[], ignoredTypes:{}};

  // Incremental UTF-8 decoding implemented here because the script sandbox has no
  // Buffer, atob or TextDecoder. Never inspect page credentials or application stores.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function decode(s, encoded) {
    const bytes = s.carry.slice(); let bits=0, value=0;
    for (const ch of encoded || '') {
      if (ch==='=') break;
      const n=alphabet.indexOf(ch); if(n<0) continue;
      value=(value<<6)|n; bits+=6;
      if(bits>=8){bits-=8;bytes.push((value>>bits)&255);}
    }
    let text='', i=0;
    while(i<bytes.length){
      const b=bytes[i]; let count, cp, minimum;
      if(b<128){text+=String.fromCharCode(b);i++;continue;}
      if(b>=194&&b<=223){count=2;cp=b&31;minimum=128;}
      else if(b>=224&&b<=239){count=3;cp=b&15;minimum=2048;}
      else if(b>=240&&b<=244){count=4;cp=b&7;minimum=65536;}
      else{throw new Error('Invalid source UTF-8');}
      if(i+count>bytes.length)break;
      for(let j=1;j<count;j++){
        if((bytes[i+j]&192)!==128)throw new Error('Invalid source UTF-8 continuation');
        cp=(cp<<6)|(bytes[i+j]&63);
      }
      if(cp<minimum||cp>1114111||(cp>=55296&&cp<=57343))throw new Error('Invalid source code point');
      text+=String.fromCodePoint(cp);i+=count;
    }
    s.carry=bytes.slice(i);return text;
  }
  function consume(s, encoded, arrival, delivery, beforeResponseFinished) {
    try {
      s.buffer+=decode(s,encoded);
      let cut;
      while((cut=s.buffer.search(/\r?\n\r?\n/))>=0){
        const frame=s.buffer.slice(0,cut);
        s.buffer=s.buffer.slice(cut+(s.buffer.slice(cut).startsWith('\r\n')?4:2));
        const lines=frame.split(/\r?\n/);
        const data=lines.filter(l=>l.startsWith('data:')).map(l=>l.slice(5).replace(/^ /,'')).join('\n');
        if(!data)continue;
        const raw=JSON.parse(data), e=raw.event?.type?raw.event:raw.data?.type?raw.data:raw;
        const common={type:e.type,eventId:lines.find(l=>l.startsWith('id:'))?.slice(3).trim()||null,
          requestId:s.id,receivedAt:arrival,delivery,beforeResponseFinished,
          turnId:typeof e.turn_id==='string'?e.turn_id:null};
        let record;
        if(e.type==='content'){
          if(typeof e.delta!=='string'||e.delta.length>65536)throw new Error('Invalid content delta');
          record={...common,messageId:e.message_id,partId:e.part_id,offset:e.content_offset,
            delta:e.delta,sourceAt:null};
        } else if(e.type==='status') {
          record={...common,isStreaming:e.is_streaming,stateRevision:e.state_revision??null};
        } else if(e.type==='done') {
          record={...common,finishReason:e.finish_reason??null};
        } else if(e.type==='steer_message'||e.type==='user_message') {
          record={...common,inputId:e.id}; // Instruction text is not exported.
        } else if(e.type==='queue_state') {
          record={...common,entryIds:Array.isArray(e.entries)?e.entries.map(x=>x.entry_id):[],
            stateRevision:e.state_revision??null};
        } else {
          result.ignoredTypes[e.type||'unknown']=(result.ignoredTypes[e.type||'unknown']||0)+1;
          continue; // In particular: never export reasoning, tool args/results or history bodies.
        }
        if(result.frames.length<4000)result.frames.push(record);else result.droppedFrames++;
      }
      if(s.buffer.length>2097152)throw new Error('SSE frame buffer exceeded');
    } catch(error){result.errors.push(String(error).slice(0,160));s.buffer='';s.carry=[];}
  }
  session.on('Network.requestWillBeSent',p=>{
    if(p.request.url!==endpoint||p.request.method!=='POST')return;
    try{
      if(JSON.parse(p.request.postData||'{}').conversation_id!==conversationId)return;
      streams.set(p.requestId,{id:p.requestId,buffer:'',carry:[],ready:false,pending:[],finished:false,responded:false});
    }catch{result.errors.push('Source conversation association unavailable');}
  });
  session.on('Network.responseReceived',p=>{
    const s=streams.get(p.requestId);if(!s)return;s.responded=true;
    result.requests.push({requestId:p.requestId,status:p.response.status,mimeType:p.response.mimeType,
      responseAt:new Date().toISOString()});
    const task=(async()=>{
      try{
        const response=await session.send('Network.streamResourceContent',{requestId:p.requestId});
        consume(s,response.bufferedData,new Date().toISOString(),'buffered-at-attach',!s.finished);
        s.ready=true;
        for(const chunk of s.pending)consume(s,chunk.data,chunk.at,'incremental',chunk.open);
        s.pending=[];
      }catch(error){result.errors.push(String(error).slice(0,160));}
    })();tasks.add(task);task.finally(()=>tasks.delete(task));
  });
  session.on('Network.dataReceived',p=>{
    const s=streams.get(p.requestId);if(!s||!p.data)return;result.incrementalChunks++;
    const at=new Date().toISOString(),open=!s.finished;
    if(s.ready)consume(s,p.data,at,'incremental',open);
    else if(s.pending.length<256)s.pending.push({data:p.data,at,open});
    else result.errors.push('Pending transport chunk limit exceeded');
  });
  for(const name of ['Network.loadingFinished','Network.loadingFailed'])session.on(name,p=>{
    const s=streams.get(p.requestId);if(!s)return;s.finished=true;
    const request=result.requests.find(r=>r.requestId===p.requestId);
    if(request){request.closedAt=new Date().toISOString();request.closeKind=name;}
  });
  try{
    await session.send('Network.enable',{maxPostDataSize:10000});
    await page.reload({waitUntil:'domcontentloaded',timeout:20000});
    let published=0;
    const duration=Math.min(500000,Math.max(1000,options.durationMs??45000));
    const deadline=Date.now()+duration;
    if(options.onAttached)await options.onAttached(page);
    while(Date.now()<deadline){
      await page.waitForTimeout(1000);
      if(options.relay){
        while(published<result.frames.length){
          const frames=result.frames.slice(published,published+128);
          const response=await page.request.post('http://127.0.0.1:4318/api/native',{
            data:{projectId,conversationId,frames},timeout:5000});
          if(response.status()!==200)throw new Error('Scoped native relay rejected capture');
          published+=frames.length;
        }
      }
    }
    result.relayedFrames=published;
  }finally{
    session.removeAllListeners();await Promise.allSettled([...tasks]);await session.detach();
  }
  result.responsesStillOpen=[...streams.values()].filter(s=>s.responded&&!s.finished).length;
  result.finishedAt=new Date().toISOString();return result;
}
