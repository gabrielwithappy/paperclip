import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {prepareMcp} from '../src/mcp.ts';

async function command(args,options){
 return new Promise((resolve,reject)=>{
  const child=spawn('opencode',args,options);let stdout='',stderr='';
  const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('OpenCode fixture timed out'));},25000);
  child.on('error',e=>{clearTimeout(timer);reject(e)});
  child.stdout.on('data',c=>stdout+=c);child.stderr.on('data',c=>stderr+=c);
  child.on('exit',code=>{clearTimeout(timer);resolve({code,stdout,stderr})});
 });
}

test('actual OpenCode 1.18.9 resolves private header and authenticates MCP tools/list',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'actual-opencode-mcp-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const token='actual-cli-fixture-token';const calls=[];
 const service=http.createServer(async(req,res)=>{
  if(req.headers.authorization!=='Bearer '+token){res.writeHead(401);res.end();return}
  if(req.method==='GET'){res.writeHead(405);res.end();return}
  let raw='';for await(const c of req)raw+=c;
  let message;try{message=JSON.parse(raw)}catch{res.writeHead(400);res.end();return}
  calls.push(message.method);
  if(message.id===undefined){res.writeHead(202);res.end();return}
  let result={};
  if(message.method==='initialize')result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}};
  if(message.method==='tools/list')result={tools:[{name:'read_fixture',description:'Read fixture',inputSchema:{type:'object',properties:{}},annotations:{readOnlyHint:true}}]};
  if(message.method==='tools/call')result={content:[{type:'text',text:'fixture read success'}]};
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:message.id,result}));
 });
 await new Promise(resolve=>service.listen(0,'127.0.0.1',resolve));t.after(()=>{service.closeAllConnections();service.close()});
 const env={PATH:process.env.PATH,HOME:root,XDG_CONFIG_HOME:root+'/config',XDG_DATA_HOME:root+'/data',XDG_CACHE_HOME:root+'/cache',XDG_STATE_HOME:root+'/state',OPENCODE_DISABLE_PROJECT_CONFIG:'true',OPENCODE_CONFIG:'',OPENCODE_CONFIG_DIR:'',OPENCODE_DISABLE_MODELS_FETCH:'true'};
 const v=await command(['--version'],{env,cwd:root});assert.equal(v.stdout.trim(),'1.18.9','The fixture targets the supported CLI version');
 const server={name:'Fixture',connectionId:'cli',url:`http://127.0.0.1:${service.address().port}/mcp`,token};
 const prepared=await prepareMcp([server],env);t.after(prepared.cleanup);
 const result=await command(['mcp','list'],{env:{...env,OPENCODE_CONFIG_CONTENT:prepared.inline},cwd:root});
 assert.equal(result.code,0,result.stderr);assert(calls.includes('initialize'));assert(calls.includes('tools/list'),JSON.stringify({calls,stdout:result.stdout,stderr:result.stderr}));
 assert(!result.stdout.includes(token));assert(!result.stderr.includes(token));
});
