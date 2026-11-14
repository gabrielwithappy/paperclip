import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServerAdapter,execute,sessionCodec} from '../dist/server.js';
import {serverKey,mcpIdentity} from '../src/mcp.ts';
const token='fixture-private-token-do-not-log';
const server={name:'Fixture',connectionId:'fixture',url:'http://127.0.0.1:1/mcp',token};
async function fixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'adapter-execute-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const command=path.join(dir,'fake-opencode');
 await fs.writeFile(command,`#!/usr/bin/env node
const fs=require('node:fs');
const args=process.argv.slice(2);
if(args[0]==='--version'){console.log('1.18.9');process.exit(0)}
let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{
const conf=JSON.parse(process.env.OPENCODE_CONFIG_CONTENT||'{}');
fs.writeFileSync(process.env.FIXTURE_CAPTURE,JSON.stringify({args,conf,input}));
const key=Object.keys(conf.mcp||{}).find(k=>k.startsWith('paperclip_run_'));
const file=key?conf.mcp[key].headers.Authorization.slice(6,-1):null;
if(file&&!fs.readFileSync(file,'utf8').startsWith('Bearer ')) process.exit(3);
console.log(JSON.stringify({type:'text',sessionID:'session-fixture',part:{text:'Read success'}}));
});
`,{mode:0o755});
 const capture=path.join(dir,'capture.json'),logs=[];
 const ctx={runId:'fixture-run',agent:{id:'fixture-agent',companyId:'fixture-company',name:'fixture',adapterType:'opencode_local',adapterConfig:{}},runtime:{sessionId:null,sessionParams:null,sessionDisplayId:null,taskKey:null},config:{command,cwd:dir,model:'fixture/model',paperclipSkillSync:false,env:{XDG_CONFIG_HOME:dir,OPENCODE_CONFIG:'',OPENCODE_CONFIG_DIR:'',FIXTURE_CAPTURE:capture,OPENCODE_ALLOW_ALL_MODELS:'1'}},context:{},runtimeMcp:{getServers:()=>[server]},onLog:async(s,c)=>logs.push(c),onMeta:async m=>logs.push(JSON.stringify(m))};
 return {ctx,capture,logs,dir};
}
test('factory capabilities and session codec parity',()=>{
 const a=createServerAdapter();assert.equal(a.type,'opencode_local');assert.equal(a.runtimeToolDelivery,'native_mcp');
 for(const name of ['listSkills','syncSkills','listModels','getRuntimeCommandSpec','testEnvironment'])assert.equal(typeof a[name],'function');assert.equal(a.supportsToolRefreshOnResume,false);
 const p={sessionId:'s',cwd:'/tmp',paperclipMcpIdentity:mcpIdentity([server]),token:'nope'};
 assert.deepEqual(sessionCodec.deserialize(sessionCodec.serialize(p)),{sessionId:'s',cwd:'/tmp',paperclipMcpIdentity:p.paperclipMcpIdentity});
});
test('real base executor receives MCP refs, cleans files, resumes rotation and resets removed tools',async t=>{
 const f=await fixture(t),before=JSON.stringify(f.ctx.config);const r=await execute(f.ctx);assert.equal(r.exitCode,0,r.errorMessage);assert.equal(JSON.stringify(f.ctx.config),before);
 const capture=JSON.parse(await fs.readFile(f.capture,'utf8')),entry=capture.conf.mcp[serverKey('fixture')];assert(entry);assert.equal(entry.oauth,false);await assert.rejects(fs.stat(entry.headers.Authorization.slice(6,-1)),{code:'ENOENT'});
 assert(!f.logs.join('').includes(token));assert(!JSON.stringify(r).includes(token));assert.equal(r.sessionParams.paperclipMcpIdentity,mcpIdentity([server]));
 f.ctx.runtime={...f.ctx.runtime,sessionId:r.sessionId,sessionParams:r.sessionParams};f.ctx.runtimeMcp={getServers:()=>[{...server,token:'rotated-fixture-token'}]};
 const second=await execute(f.ctx);assert.equal(second.exitCode,0,second.errorMessage);assert(JSON.parse(await fs.readFile(f.capture,'utf8')).args.includes('--session'));
 f.ctx.runtimeMcp={getServers:()=>[]};const third=await execute(f.ctx);assert.equal(third.exitCode,0,third.errorMessage);assert(!JSON.parse(await fs.readFile(f.capture,'utf8')).args.includes('--session'));
});
test('scoped target and wrong CLI version fail before base invocation',async t=>{
 const f=await fixture(t);const r=await execute({...f.ctx,config:{...f.ctx.config,filesystemScope:{}}});assert.equal(r.errorCode,'opencode_mcp_target_unsupported');
 await fs.writeFile(f.ctx.config.command,'#!/bin/sh\necho 2.0.0\n',{mode:0o755});const v=await execute(f.ctx);assert.equal(v.errorCode,'opencode_mcp_version_unsupported');await assert.rejects(fs.stat(f.capture),{code:'ENOENT'});
});
test('environment diagnostics reject scoped targets before probing the base or host',async()=>{
 const a=createServerAdapter();
 const r=await a.testEnvironment({companyId:'fixture-company',adapterType:'opencode_local',config:{command:'/not/a/command',networkScope:{}},executionTarget:null});
 assert.equal(r.status,'fail');assert(r.checks.some(c=>c.code==='opencode_mcp_target_unsupported'));
 assert(r.checks.some(c=>c.code==='opencode_mcp_bridge_build'));
 assert(!r.checks.some(c=>c.code==='opencode_mcp_cli_compatibility'));
});
test('startup failure still removes the private credential file',async t=>{
 const f=await fixture(t);let file;
 f.ctx.onMeta=async(meta)=>{
  const raw=meta.env?.OPENCODE_CONFIG_CONTENT;
  if(typeof raw==='string')file=JSON.parse(raw).mcp[serverKey('fixture')].headers.Authorization.slice(6,-1);
  throw new Error('fixture startup observer failed');
 };
 const result=await execute(f.ctx);assert.equal(result.errorCode,'opencode_mcp_delivery_failed');
 assert.equal(result.errorMessage,'fixture startup observer failed');
 assert.equal(typeof file,'string','observer must capture the actual credential reference');
 await assert.rejects(fs.stat(file),{code:'ENOENT'});
});
test('remote MCP execution and diagnostics reject before SSH/provider probing',async t=>{
 const f=await fixture(t);
 const executionTarget={kind:'remote',transport:'ssh',remoteCwd:'/tmp/fixture',spec:{host:'fixture.invalid',port:22,username:'fixture',remoteWorkspacePath:'/tmp/fixture',remoteCwd:'/tmp/fixture',privateKey:null,knownHosts:null,strictHostKeyChecking:true}};
 const run=await execute({...f.ctx,executionTarget});assert.equal(run.errorCode,'opencode_mcp_target_unsupported');
 const diag=await createServerAdapter().testEnvironment({companyId:'fixture-company',adapterType:'opencode_local',config:f.ctx.config,executionTarget});
 assert.equal(diag.status,'fail');assert(diag.checks.some(c=>c.code==='opencode_mcp_target_unsupported'));
 await assert.rejects(fs.stat(f.capture),{code:'ENOENT'});
});
