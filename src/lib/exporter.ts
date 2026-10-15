import { renderFlow, type Orientation, type RenderInput } from './flow';
import { safeFilename } from './format';

export function downloadBlob(filename: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function baseName(doc: { title: string; code?: string }) {
  return safeFilename((doc.code ? doc.code + ' - ' : '') + (doc.title || 'flowchart'));
}

export function exportSvg(doc: RenderInput & { code?: string }, table: boolean, orientation: Orientation) {
  const r = renderFlow(doc, { table, orientation });
  downloadBlob(baseName(doc) + '.svg', new Blob([r.svg], { type: 'image/svg+xml' }));
}

export async function exportPng(doc: RenderInput & { code?: string }, table: boolean, orientation: Orientation, scale = 2) {
  const r = renderFlow(doc, { table, orientation });
  const url = URL.createObjectURL(new Blob([r.svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('Gagal membuat gambar')); img.src = url; });
    const cv = document.createElement('canvas');
    cv.width = r.width * scale; cv.height = r.height * scale;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, 'image/png'));
    if (!blob) throw new Error('Gagal membuat PNG');
    downloadBlob(baseName(doc) + '.png', blob);
  } finally { URL.revokeObjectURL(url); }
}

export function exportJson(doc: object & { title: string; code?: string }) {
  downloadBlob(baseName(doc) + '.json', new Blob([JSON.stringify({ format: 'flowcraft', version: 1, flowchart: doc }, null, 2)], { type: 'application/json' }));
}

/** Buka jendela cetak berisi flowchart saja (bisa disimpan sebagai PDF dari dialog cetak). */
export function printFlow(doc: RenderInput, table: boolean, orientation: Orientation) {
  const r = renderFlow(doc, { table, orientation });
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${baseName(doc as { title: string })}</title>
<style>@page{size:${r.width > r.height ? 'A4 landscape' : 'A4 portrait'};margin:10mm}html,body{margin:0}svg{width:100%;height:auto;display:block}</style></head>
<body>${r.svg}<script>window.onload=function(){setTimeout(function(){window.print()},150)}<\/script></body></html>`);
  w.document.close();
  return true;
}
