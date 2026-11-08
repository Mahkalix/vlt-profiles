import { mkdir, access } from 'node:fs/promises';
await mkdir('public/downloads', { recursive: true });
for (const file of ['public/index.html', 'public/app.js', 'public/style.css', 'public/downloads/vlt-connector.zip']) await access(file);
console.log('Static site and Windows connector archive ready.');
