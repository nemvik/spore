/** Offline verification of retained real campaign exports. Never opens a browser
 * or writes a campaign. Checkpoint recovery happens only on parsed test copies.
 */
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createServer} from 'vite';
const root=path.resolve('evidence/final-campaign');
const ssr=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error'});
const {parseGame,serializeGame}=await ssr.ssrLoadModule('/src/game/persistence.ts');
const {recoverGeneration}=await ssr.ssrLoadModule('/src/game/simulation.ts');
await ssr.close();
const files=[];
async function visit(dir){for(const item of await readdir(dir,{withFileTypes:true})){const name=path.join(dir,item.name);if(item.isDirectory())await visit(name);else if(item.name.endsWith('.save.json')&&name!==path.join(root,'organism','active-campaign.save.json'))files.push(name);}}
await visit(root);const rows=[];
for(const file of files.sort()){
  const bytes=await readFile(file),sourceHash=createHash('sha256').update(bytes).digest('hex'),s=parseGame(bytes.toString()),round=parseGame(serializeGame(s));
  assert.deepEqual(round,s,'Roundtrip: '+file);assert.equal(s.seed,8675309);assert.ok(s.checkpoint);
  const checkpoint=JSON.parse(s.checkpoint),recovered=recoverGeneration(parseGame(bytes.toString()));
  for(const key of ['stage','tick','rng','genome','tribe','machines','cities','states','civilization','commerce','space','lineageHistory']){
    if(key==='genome')assert.deepEqual(recovered.player.genome,checkpoint.player.genome);
    else assert.deepEqual(recovered[key],checkpoint[key],`Checkpoint ${key}: ${file}`);
  }
  assert.deepEqual(parseGame(serializeGame(recovered)),recovered,'Recovered state validation: '+file);
  assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'),sourceHash,'Source changed: '+file);
  rows.push({file:path.relative(root,file),sha256:sourceHash,stage:s.stage,tick:s.tick,generation:s.player.generation,checkpointStage:checkpoint.stage,roundtrip:true,checkpointRecovery:true});
}
const result={at:new Date().toISOString(),checks:rows.length,errors:[],provenance:'Offline parsed copies of retained native campaign exports, exact roundtrip and checkpoint recovery; no live state modification and no additional played progression.',files:rows};
await writeFile(path.resolve(process.env.LUMAVORA_AUDIT_OUTPUT??path.join(root,'save-audit.json')),JSON.stringify(result,null,2));console.log(JSON.stringify({checks:rows.length,errors:[],stages:[...new Set(rows.map(r=>r.stage))]}));
