import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { french, translate } from '../public/translations.js';
test('French interpolation preserves literal user names and English is unchanged', () => {
 const name = '<script>$& {account} SOURCE</script>';
 assert.equal(translate('Delete profile {name}', 'fr', {name}), 'Supprimer le profil '+name);
 assert.equal(translate('Delete profile {name}', 'en', {name}), 'Delete profile '+name);
 assert.equal(translate('Unknown OS error', 'fr'), 'Unknown OS error');
});
test('public page copy has French coverage, excluding brand names, paths and symbols', async () => {
 const unchanged = new Set(['VLT','/ PROFILES','VLT / PROFILES','GITHUB ↗','Guides','Documentation | VLT Profiles','PowerShell 7','Demarrer.cmd','Profils-Supprimes','Profils-Cloud','Sauvegardes-Cloud','%LOCALAPPDATA%\\VLTProfiles','FR','EN']);
 for(const file of ['index.html','docs.html']){
  const html=await readFile(new URL('../public/'+file,import.meta.url),'utf8');
  for(const match of html.matchAll(/>([^<>]+)</g)){
   const text=match[1].trim();
   if(!/[a-z]/i.test(text) || unchanged.has(text))continue;
   assert.ok(Object.hasOwn(french,text), `Missing translation: ${text}`);
  }
 }
});
