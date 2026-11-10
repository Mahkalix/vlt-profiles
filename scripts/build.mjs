import { mkdir, access, copyFile, cp, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { SECURITY_HEADERS } from '../connector/security.mjs';
const core=['index.html','docs.html','app.js','connector-client.js','workspace-state.js','i18n.js','translations.js','pwa.js','style.css','fonts.css','icon.svg','manifest.webmanifest'];
async function files(dir){const result=[];for(const entry of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+entry.name;if(entry.isDirectory())result.push(...await files(p));else result.push(p);}return result;}
const assetFiles=(await files('public/assets')).filter(file=>/\.(png|ttf)$/.test(file)).sort();
const publicFiles=[...core.map(file=>'public/'+file),...assetFiles];
const hash=createHash('sha256');for(const file of publicFiles)hash.update(file).update(await readFile(file));hash.update(await readFile('scripts/sw-template.js'));
const paths=publicFiles.map(file=>file==='public/index.html'?'/':file.replace('public',''));
const sw=(await readFile('scripts/sw-template.js','utf8')).replace('__VERSION__',hash.digest('hex').slice(0,16)).replace('__ASSETS__',JSON.stringify(paths));await writeFile('public/sw.js',sw);
await mkdir('connector/web',{recursive:true});
for(const file of [...core,'sw.js'])await copyFile('public/'+file,'connector/web/'+file);
await cp('public/assets','connector/web/assets',{recursive:true});
const types={html:'text/html',js:'text/javascript',css:'text/css',svg:'image/svg+xml',png:'image/png',ttf:'font/ttf',webmanifest:'application/manifest+json'};
const routes={};for(const file of [...publicFiles,'public/sw.js']){const relative=file.slice(7);routes[relative==='index.html'?'/':'/'+relative]=[relative,types[relative.split('.').pop()]];}
routes['/docs']=routes['/docs/']=routes['/docs.html'];
await writeFile('connector/static-assets.mjs','export const STATIC_ASSETS = '+JSON.stringify(routes,null,2)+';\n');
const config=JSON.parse(await readFile('vercel.json','utf8'));config.headers=[{source:'/(.*)',headers:Object.entries(SECURITY_HEADERS).map(([key,value])=>({key,value}))},{source:'/sw.js',headers:[{key:'Cache-Control',value:'no-cache, no-store, must-revalidate'}]}];await writeFile('vercel.json',JSON.stringify(config,null,2)+'\n');
await mkdir('public/downloads',{recursive:true});await access('public/downloads/vlt-connector.zip');
console.log('Built static site, PWA public cache, local asset allowlist and security headers.');
