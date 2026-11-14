// Read-only reproducible native-SSE feasibility probe. Never send instructions.
import { writeFile } from 'node:fs/promises';
const project='e6c7fbf5-1f8a-4427-a320-c9eaad5ff200';
const conversation=process.env.CONVERSATION_ID??'85d25add-67b5-44bc-8d9f-2a6414c0a5ee';
const url=`https://api.factory.8090.dev/v2/project/${project}/agents/chat-agent/stream`;
const began=performance.now();
const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Accept':'text/event-stream'},
 body:JSON.stringify({conversation_id:conversation,last_event_id:null,tail_user_messages:5}),signal:AbortSignal.timeout(15000)});
const result={checkedAt:new Date().toISOString(),url,authenticated:false,status:response.status,
 durationMs:performance.now()-began,contentType:response.headers.get('content-type'),body:await response.text(),
 conclusion:response.status===401?'Authenticated stream is blocked in this workspace; not evidence streaming is impossible.':'Unexpected result; inspect manually.'};
console.log(JSON.stringify(result,null,2));if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(result,null,2)+'\n');
