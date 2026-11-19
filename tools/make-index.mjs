// page.html (게시용 본문) 을 감싸 index.html 을 만든다. 로컬 실행과 GitHub Pages 에 쓴다.
// 사용법: node tools/make-index.mjs   (page.html 을 고친 뒤 실행)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const body = fs.readFileSync(path.join(root, 'page.html'), 'utf8');
const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>
:root { color-scheme: light; padding: env(safe-area-inset-top, 0px) 0 env(safe-area-inset-bottom, 0px); box-sizing: border-box; }
body { margin: 0; font: 14px system-ui, sans-serif; }
img { max-width: 100%; }
[hidden] { display: none !important; }
</style>
</head>
<body>
${body}
</body>
</html>
`;
fs.writeFileSync(path.join(root, 'index.html'), html);
console.log('index.html 을 만들었습니다');
