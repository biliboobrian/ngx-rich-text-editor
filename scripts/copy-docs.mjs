import { copyFileSync } from 'node:fs';
for (const f of ['README.md', 'LICENSE']) copyFileSync(f, `dist/ngx-rich-text-editor/${f}`);
console.log('README.md + LICENSE copied to dist/ngx-rich-text-editor');
