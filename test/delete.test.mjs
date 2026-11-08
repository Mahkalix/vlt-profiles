import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
test('deletion archives only the selected profile without Riot login', async () => {
 const root=await mkdtemp(path.join(tmpdir(),'vlt-delete-test-'));
 const folder=path.join(root,'VLTProfiles','Profils-Cloud');
 try {
  await mkdir(folder,{recursive:true});
  await writeFile(path.join(folder,'fixture.json'),'preserved-settings');
  await writeFile(path.join(folder,'keep.json'),'other-profile');
  const run=id=>JSON.parse(spawnSync('pwsh',['-NoProfile','-File','connector/worker.ps1'],{input:JSON.stringify({action:'delete',id}),encoding:'utf8',env:{...process.env,LOCALAPPDATA:root}}).stdout.trim());
  assert.equal(run('../keep').ok,false);
  assert.equal(run('fixture').result.deleted,true);
  assert.deepEqual(await readdir(folder),['keep.json']);
  const trash=path.join(root,'VLTProfiles','Profils-Supprimes');
  const files=await readdir(trash);assert.equal(files.length,1);
  assert.equal(await readFile(path.join(trash,files[0]),'utf8'),'preserved-settings');
  assert.equal(run('fixture').ok,false);
  assert.equal(await readFile(path.join(folder,'keep.json'),'utf8'),'other-profile');
 } finally { await rm(root,{recursive:true,force:true}); }
});
