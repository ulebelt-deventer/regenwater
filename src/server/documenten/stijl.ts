import fs from 'node:fs';
import path from 'node:path';

let fonts: string | null = null;

// Figtree inlined as data URLs, so the PDF printer needs no network and no static file server.
function fontFaces(): string {
  if (fonts === null) {
    const dir = path.resolve('node_modules/@fontsource/figtree/files');
    fonts = [400, 700, 800]
      .map((w) => {
        const data = fs.readFileSync(path.join(dir, `figtree-latin-${w}-normal.woff2`)).toString('base64');
        return `@font-face{font-family:Figtree;font-weight:${w};src:url(data:font/woff2;base64,${data}) format('woff2')}`;
      })
      .join('');
  }
  return fonts;
}

export function documentStijl(): string {
  return `${fontFaces()}
@page { size: A4; margin: 18mm 16mm 20mm; }
* { box-sizing: border-box; }
body { font-family: Figtree, Arial, sans-serif; font-size: 10.5pt; line-height: 1.45; color: #1a1a1a; margin: 0; background: #fff; }
.scherm body, body.scherm { background: #f7f0e5; }
.blad { max-width: 760px; margin: 0 auto; background: #fff; }
.scherm .blad { padding: 24px 20px 48px; margin: 16px auto; border-radius: 8px; }
h1 { font-weight: 800; font-size: 19pt; color: #00643c; margin: 0 0 12px; line-height: 1.2; }
h2 { font-weight: 800; font-size: 14pt; color: #00643c; margin: 22px 0 8px; break-after: avoid; }
h3 { font-weight: 800; font-size: 11.5pt; margin: 16px 0 6px; break-after: avoid; }
p { margin: 0 0 8px; white-space: pre-wrap; }
a { color: #00643c; }
.kop { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 8px; }
.kop .logo { width: 150px; flex: none; }
.kop .logo svg { width: 100%; height: auto; display: block; }
.icoon svg { width: 1em; height: 1em; vertical-align: -.125em; margin-right: 4px; }
.kop-tabel td { padding: 1px 12px 1px 0; vertical-align: top; }
.kop-tabel td:first-child { font-weight: 700; white-space: nowrap; }
table.tabel { border-collapse: collapse; width: 100%; margin: 6px 0 8px; break-inside: avoid; }
table.tabel th, table.tabel td { border: 1px solid #c9c2b6; padding: 4px 6px; text-align: left; vertical-align: top; }
table.tabel th { background: #f7f0e5; font-weight: 700; }
td.getal, th.getal { text-align: right; white-space: nowrap; }
.klein { font-size: 8.5pt; color: #6c6c6c; }
.voetnoot { font-size: 8.5pt; color: #444; margin: 0; }
.leeg { color: #9a6200; font-style: italic; }
.fotos { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0 10px; }
.fotos figure { margin: 0; width: calc(50% - 4px); break-inside: avoid; }
.fotos figure.breed { width: 100%; }
.kolommen { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
.foto { position: relative; line-height: 0; }
.foto img { width: 100%; height: auto; display: block; border-radius: 3px; }
.foto svg { position: absolute; inset: 0; width: 100%; height: 100%; }
figcaption { font-size: 8.5pt; color: #444; margin-top: 3px; line-height: 1.3; }
ul { margin: 0 0 8px; padding-left: 20px; }
.nieuwe-pagina { break-before: page; }
.lijnen { border-bottom: 1px solid #999; height: 26px; }
.vak { border: 1px solid #999; border-radius: 3px; }
.optie { display: inline-block; margin: 2px 16px 2px 0; white-space: nowrap; }
.optie::before { content: ''; display: inline-block; width: 11px; height: 11px; border: 1.2px solid #1a1a1a; margin-right: 5px; vertical-align: -1px; }
.veld { margin-bottom: 12px; break-inside: avoid; }
.veld-label { font-weight: 700; }
.blok { border: 1px solid #c9c2b6; border-radius: 4px; padding: 8px 10px; margin-bottom: 10px; break-inside: avoid; }
.knoppen { margin: 16px 0; }
.knop { font: inherit; background: #00643c; color: #fff; border: 0; border-radius: 6px; padding: 8px 16px; cursor: pointer; }
.concept-banner { background: #fff3cd; border: 1px solid #f0a500; color: #6b4500; padding: 8px 12px; border-radius: 6px; margin-bottom: 16px; }
@media print { .geen-print { display: none !important; } .scherm .blad { padding: 0; margin: 0; } body.scherm { background: #fff; } }
`;
}
