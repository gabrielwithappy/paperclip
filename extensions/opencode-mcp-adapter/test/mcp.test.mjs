import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {prepareMcp,mcpIdentity,credentialRedactor,serverKey} from '../src/mcp.ts';
const server={name:'Todoist',connectionId:'connection-a',url:'https://example.invalid/mcp',token:'fixture-only-credential'};
async function isolated(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mcp-unit-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return {dir,env:{XDG_CONFIG_HOME:dir,OPENCODE_CONFIG:'',OPENCODE_CONFIG_DIR:''}}}
test('private files, user MCP/provider preservation, same-name connections and cleanup',async t=>{
 const {env}=await isolated(t);const original={provider:{custom:{options:{baseURL:'https://example.invalid'}}},mcp:{user:{type:'local',command:['true']}}};
 const prepared=await prepareMcp([server,{...server,connectionId:'connection-b'}],{...env,OPENCODE_CONFIG_CONTENT:JSON.stringify(original)});t.after(prepared.cleanup);
 assert.equal((await fs.stat(prepared.directory)).mode&0o777,0o700);assert(!prepared.inline.includes(server.token));
 const config=JSON.parse(prepared.inline);assert.deepEqual(config.provider,original.provider);assert.deepEqual(config.mcp.user,original.mcp.user);assert.equal(Object.keys(config.mcp).length,3);
 for(const key of [serverKey(server.connectionId),serverKey('connection-b')]){const c=config.mcp[key];assert.equal(c.oauth,false);const file=c.headers.Authorization.slice(6,-1);assert.equal((await fs.stat(file)).mode&0o777,0o600);assert.equal(await fs.readFile(file,'utf8'),'Bearer '+server.token)}
 await prepared.cleanup();await assert.rejects(fs.stat(prepared.directory),{code:'ENOENT'});
});
test('reject malformed config, JSONC collisions, invalid URLs, duplicate identities and header injection',async t=>{
 const {dir,env}=await isolated(t);await assert.rejects(prepareMcp([server],{...env,OPENCODE_CONFIG_CONTENT:'{broken'}),/Invalid OpenCode/);
 await fs.mkdir(path.join(dir,'opencode'));await fs.writeFile(path.join(dir,'opencode/opencode.jsonc'),'{ // comment\n "mcp":{"'+serverKey(server.connectionId)+'":{}},\n}');
 await assert.rejects(prepareMcp([server],env),/conflicts/);await assert.rejects(prepareMcp([server,server],env),/Duplicate/);
 await assert.rejects(prepareMcp([{...server,url:'file:///tmp/no'}],env),/Unsupported/);await assert.rejects(prepareMcp([{...server,token:'bad\nheader'}],env),/credential/);
});
test('concurrent prepares isolate credentials while identity excludes rotating token and file paths',async t=>{
 const {env}=await isolated(t);const [a,b]=await Promise.all([prepareMcp([server],env),prepareMcp([{...server,token:'other-token'}],env)]);t.after(a.cleanup);t.after(b.cleanup);
 assert.notEqual(a.directory,b.directory);assert.equal(a.identity,b.identity);assert.notEqual(mcpIdentity([]),a.identity);
});
test('redacts credentials across stream boundaries and nested results',()=>{
 const r=credentialRedactor(['fixture-secret-one','fixture-secret-two']);let out=r.push('stdout','prefix fixture-sec');out+=r.push('stdout','ret-one suffix');out+=r.push('stdout','',true);
 assert.equal(out,'prefix [REDACTED] suffix');assert.deepEqual(r.value({data:['fixture-secret-two']}),{data:['[REDACTED]']});
});
