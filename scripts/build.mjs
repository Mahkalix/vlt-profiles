import { mkdir, access, copyFile } from 'node:fs/promises';
await mkdir('connector/web', { recursive: true });
for (const file of ['index.html', 'app.js', 'style.css', 'icon.svg']) await copyFile('public/'+file, 'connector/web/'+file);
await mkdir('public/downloads', { recursive: true });
for (const file of ['public/index.html', 'public/app.js', 'public/style.css', 'public/downloads/vlt-connector.zip']) await access(file);
console.log('Static site and Windows connector archive ready.');
