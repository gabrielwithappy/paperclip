import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {execute} from '../dist/server.js';

test('real base adapter and actual CLI call an authenticated MCP tool using a local model fixture', {timeout:45000}, async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'opencode-call-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 let token='e2e-fixture-auth-token';const calls=[],modelRequests=[];let callCount=0;
 const service=http.createServer(async(req,res)=>{
  let text='';for await(const c of req)text+=c;
  if(req.url==='/mcp'){
   if(req.headers.authorization!=='Bearer '+token){res.writeHead(401);res.end();return}
   if(req.method!=='POST'){res.writeHead(405);res.end();return}
   const m=JSON.parse(text);calls.push(m.method);
   if(m.id===undefined){res.writeHead(202);res.end();return}
   let result={};
   if(m.method==='initialize')result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}};
   if(m.method==='tools/list')result={tools:[{name:'read_fixture',description:'Return fixture result',inputSchema:{type:'object',properties:{}},annotations:{readOnlyHint:true}}]};
   if(m.method==='tools/call'){assert.equal(m.params.name,'read_fixture');callCount++;result={content:[{type:'text',text:'fixture-read-result'}]}}
   res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:m.id,result}));return;
  }
  if(req.url?.endsWith('/chat/completions')){
   const body=JSON.parse(text);modelRequests.push({hasTools:!!body.tools?.length});
   const tool=body.tools?.find(x=>x.function?.name?.endsWith('read_fixture'));
   const lastUser=body.messages?.findLastIndex(m=>m.role==='user') ?? -1;
   const hasResult=body.messages?.slice(lastUser+1).some(m=>m.role==='tool');
   const toolCall=tool&&!hasResult;
   const message=toolCall?{role:'assistant',content:null,tool_calls:[{id:'fixture-call',type:'function',function:{name:tool.function.name,arguments:'{}'}}]}:{role:'assistant',content:'fixture-read-result'};
   if(body.stream){
    res.writeHead(200,{'Content-Type':'text/event-stream'});
    const chunk=(delta,finish=null)=>({id:'fixture-completion',object:'chat.completion.chunk',created:1,model:'fixture-model',choices:[{index:0,delta,finish_reason:finish}]});
    const delta=toolCall?{role:'assistant',tool_calls:[{index:0,...message.tool_calls[0]}]}:message;
    res.write('data: '+JSON.stringify(chunk(delta))+'\n\n');
    res.write('data: '+JSON.stringify(chunk({},toolCall?'tool_calls':'stop'))+'\n\n');res.end('data: [DONE]\n\n');
   }else{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({id:'fixture-completion',object:'chat.completion',model:'fixture-model',choices:[{index:0,message,finish_reason:toolCall?'tool_calls':'stop'}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}}))}return;
  }
  res.writeHead(404);res.end();
 });
 await new Promise(resolve=>service.listen(0,'127.0.0.1',resolve));t.after(()=>{service.closeAllConnections();service.close()});
 const origin=`http://127.0.0.1:${service.address().port}`;
 const inline={provider:{fixture:{npm:'@ai-sdk/openai-compatible',name:'Fixture',options:{baseURL:origin+'/v1',apiKey:'fixture-only'},models:{'fixture-model':{name:'Fixture',limit:{context:32000,output:4000}}}}},small_model:'fixture/fixture-model'};
 const env={HOME:root,XDG_CONFIG_HOME:root+'/config',XDG_DATA_HOME:root+'/data',XDG_CACHE_HOME:root+'/cache',XDG_STATE_HOME:root+'/state',OPENCODE_CONFIG:'',OPENCODE_CONFIG_DIR:'',OPENCODE_DISABLE_MODELS_FETCH:'true',OPENCODE_ALLOW_ALL_MODELS:'1',OPENCODE_CONFIG_CONTENT:JSON.stringify(inline)};
 const logs=[];
 const ctx={runId:'actual-cli-call',agent:{id:'fixture-agent',companyId:'fixture-company',name:'fixture',adapterType:'opencode_local',adapterConfig:{}},runtime:{sessionId:null,sessionParams:null,sessionDisplayId:null,taskKey:null},config:{cwd:root,command:'opencode',model:'fixture/fixture-model',timeoutSec:30,graceSec:1,paperclipSkillSync:false,env},context:{paperclipTaskMarkdown:'Call read_fixture once, then report the returned text.'},runtimeMcp:{getServers:()=>[{name:'Fixture',connectionId:'fixture',url:origin+'/mcp',token}]},onLog:async(s,c)=>logs.push(c)};
 const r=await execute(ctx);
 assert.equal(r.exitCode,0,JSON.stringify({error:r.errorMessage,logs:logs.join('').slice(-4000),calls,modelRequests}));
 assert.equal(callCount,1,JSON.stringify({calls,modelRequests,logs:logs.join('').slice(-4000)}));
 assert(!logs.join('').includes(token));assert(!JSON.stringify(r).includes(token));assert(r.sessionId);
 token='e2e-rotated-fixture-token';
 ctx.runtime={...ctx.runtime,sessionId:r.sessionId,sessionParams:r.sessionParams};
 const second=await execute(ctx);
 assert.equal(second.exitCode,0,second.errorMessage);assert.equal(second.sessionId,r.sessionId);
 assert.equal(callCount,2,JSON.stringify({calls,modelRequests}));assert(!logs.join('').includes(token));
 ctx.runtimeMcp={getServers:()=>[]};
 const third=await execute(ctx);assert.equal(third.exitCode,0,third.errorMessage);
 assert.equal(callCount,2);assert.notEqual(third.sessionId,r.sessionId);
});
