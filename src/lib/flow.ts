import type { FlowStatus, Step, StepType } from './types';

export const STEP_TYPES: Record<StepType, string> = {
  start: 'Mulai',
  process: 'Proses',
  decision: 'Keputusan',
  document: 'Dokumen',
  end: 'Selesai',
};

export const STATUS_LABEL: Record<FlowStatus, string> = { draft: 'Draft', review: 'Review', final: 'Final' };

/** Palet flowchart: tetap (seperti kertas), agar hasil unduhan sama di tema apa pun. */
export const FCP = {
  paper: '#FFFFFF', grid: '#E2E6EE', head: '#EEF1F7', headInk: '#16203A', ink: '#1C2640', sub: '#5A6580', line: '#33405E',
  start: ['#E3F3EA', '#2B7A50'], end: ['#FBE6E2', '#B13A2C'], process: ['#FFFFFF', '#2B50CF'],
  decision: ['#FFF2DC', '#C27A10'], document: ['#ECF0FF', '#5468CC'],
  font: 'Arial, Helvetica, sans-serif',
} as const;

export const UNASSIGNED_LANE = 'Tanpa pelaksana';

export function laneName(s: Pick<Step, 'lane'>): string {
  return (s.lane || '').trim() || UNASSIGNED_LANE;
}

export function laneList(steps: Pick<Step, 'lane'>[]): string[] {
  const out: string[] = [];
  for (const s of steps) {
    const l = laneName(s);
    if (!out.includes(l)) out.push(l);
  }
  return out;
}

export interface Edge { from: number; to: number; kind: 'main' | 'yes' | 'no'; label?: 'Ya' | 'Tidak'; }

export function edgesOf(steps: Step[]): Edge[] {
  const idx = new Map(steps.map((s, i) => [s.id, i]));
  const out: Edge[] = [];
  steps.forEach((s, i) => {
    if (s.type === 'end') return;
    const nextIdx = i + 1 < steps.length ? i + 1 : -1;
    const res = (ref: string | null) => (ref ? (idx.has(ref) ? idx.get(ref)! : -2) : nextIdx);
    if (s.type === 'decision') {
      const y = res(s.yes);
      if (y >= 0 && y !== i) out.push({ from: i, to: y, kind: 'yes', label: 'Ya' });
      if (s.no) {
        const n = res(s.no);
        if (n >= 0 && n !== i) out.push({ from: i, to: n, kind: 'no', label: 'Tidak' });
      }
    } else {
      const t = res(s.next);
      if (t >= 0 && t !== i) out.push({ from: i, to: t, kind: 'main' });
    }
  });
  return out;
}

export interface Issue { level: 'warn' | 'err'; message: string; stepId?: string; }

/** Pemeriksaan kelengkapan alur, ditampilkan di atas pratinjau. */
export function validate(steps: Step[]): Issue[] {
  const issues: Issue[] = [];
  if (!steps.length) return [{ level: 'warn', message: 'Belum ada langkah. Tambahkan aktivitas pertama.' }];
  const ids = new Set(steps.map((s) => s.id));
  if (steps[0].type !== 'start') issues.push({ level: 'warn', message: 'Alur sebaiknya diawali simbol Mulai', stepId: steps[0].id });
  if (!steps.some((s) => s.type === 'end')) issues.push({ level: 'err', message: 'Belum ada simbol Selesai' });
  steps.forEach((s, i) => {
    const n = i + 1;
    if (!(s.text || '').trim() && s.type !== 'start' && s.type !== 'end') issues.push({ level: 'warn', message: `Langkah ${n}: aktivitas kosong`, stepId: s.id });
    if (!(s.lane || '').trim()) issues.push({ level: 'warn', message: `Langkah ${n}: pelaksana belum diisi`, stepId: s.id });
    if (s.type === 'decision') {
      if (!s.no) issues.push({ level: 'err', message: `Langkah ${n}: cabang "Tidak" belum ditentukan`, stepId: s.id });
      if (!s.yes && i === steps.length - 1) issues.push({ level: 'err', message: `Langkah ${n}: cabang "Ya" belum ditentukan`, stepId: s.id });
    }
    for (const k of ['next', 'yes', 'no'] as const) {
      if (s[k] && !ids.has(s[k]!)) issues.push({ level: 'err', message: `Langkah ${n}: tujuan sudah dihapus`, stepId: s.id });
      if (s[k] && s[k] === s.id) issues.push({ level: 'err', message: `Langkah ${n}: mengarah ke dirinya sendiri`, stepId: s.id });
    }
    if (i === steps.length - 1 && s.type !== 'end' && s.type !== 'decision' && !s.next)
      issues.push({ level: 'err', message: `Langkah ${n} adalah langkah terakhir tapi bukan Selesai`, stepId: s.id });
  });
  const edges = edgesOf(steps);
  const seen = new Set([0]);
  const q = [0];
  while (q.length) {
    const c = q.shift()!;
    for (const e of edges) if (e.from === c && !seen.has(e.to)) { seen.add(e.to); q.push(e.to); }
  }
  steps.forEach((s, i) => { if (!seen.has(i)) issues.push({ level: 'warn', message: `Langkah ${i + 1} tidak terhubung dari awal alur`, stepId: s.id }); });
  return issues;
}

export function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** Pecah teks menjadi baris dengan panjang maksimum (karakter). */
export function wrap(text: string, max: number, maxLines: number): string[] {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (let w of words) {
    while (w.length > max) {
      if (cur) { lines.push(cur); cur = ''; }
      lines.push(w.slice(0, max - 1) + '-');
      w = w.slice(max - 1);
    }
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= max) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const k = lines.slice(0, maxLines);
    k[maxLines - 1] = k[maxLines - 1].replace(/.{0,2}$/, '') + '…';
    return k;
  }
  return lines;
}

export interface RenderInput {
  title: string;
  code?: string;
  unit?: string;
  version?: number;
  status?: FlowStatus;
  updated_at?: string;
  steps: Step[];
}

export type Orientation = 'horizontal' | 'vertical';
export interface RenderOptions {
  compact?: boolean;
  /** Tampilkan kolom/baris tabel SOP (Kegiatan, Output, Waktu). */
  table?: boolean;
  /** horizontal = alur kiri→kanan, pelaksana sebagai baris (bawaan); vertical = alur atas→bawah. */
  orientation?: Orientation;
}

function fmtDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

type Node = {
  s: Step; i: number; t: StepType; lines: string[]; w: number; h: number; lane: number; cx: number; cy: number;
};

const NODE_W = 148;

/** Ukuran simbol dan teks di dalamnya; sama untuk kedua orientasi. */
function measure(s: Step, i: number, lane: number): Node {
  const t: StepType = STEP_TYPES[s.type] ? s.type : 'process';
  const txt = (s.text || '').trim() || (t === 'start' ? 'Mulai' : t === 'end' ? 'Selesai' : '');
  let lines: string[], w: number, h: number;
  if (t === 'decision') { lines = wrap(txt, 17, 3); w = NODE_W + 8; h = Math.max(80, 44 + lines.length * 14); }
  else if (t === 'start' || t === 'end') { lines = wrap(txt, 20, 2); w = 128; h = lines.length > 1 ? 50 : 38; }
  else { lines = wrap(txt, 22, 5); w = NODE_W; h = Math.max(48, 22 + lines.length * 14) + (t === 'document' ? 10 : 0); }
  return { s, i, t, lines, w, h, lane, cx: 0, cy: 0 };
}

const stepText = (s: Step) => s.text || (s.type === 'start' ? 'Mulai' : s.type === 'end' ? 'Selesai' : '');

function svgOpen(W: number, H: number): string[] {
  const F = FCP;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${F.font}">`,
    `<defs><marker id="fc-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${F.line}"/></marker></defs>`,
    `<rect x="0" y="0" width="${W}" height="${H}" fill="${F.paper}"/>`,
  ];
}

function titleBlock(doc: RenderInput, W: number, pad: number, titleH: number): string[] {
  const F = FCP;
  const meta = [
    doc.code && 'Kode: ' + doc.code,
    doc.unit && 'Unit: ' + doc.unit,
    doc.version ? 'Versi ' + doc.version : 'Belum berversi',
    STATUS_LABEL[doc.status || 'draft'],
    fmtDate(doc.updated_at),
  ].filter(Boolean).join('   ·   ');
  return [
    `<rect x="${pad}" y="${pad}" width="${W - 2 * pad}" height="${titleH - 14}" fill="${F.head}" stroke="${F.grid}"/>`,
    `<text x="${pad + 14}" y="${pad + 26}" font-size="16" font-weight="bold" fill="${F.ink}">${esc(doc.title || 'Flowchart tanpa judul')}</text>`,
    `<text x="${pad + 14}" y="${pad + 47}" font-size="11.5" fill="${F.sub}">${esc(meta)}</text>`,
    `<text x="${W - pad - 14}" y="${pad + 26}" font-size="10" font-weight="bold" fill="${F.sub}" text-anchor="end" letter-spacing="1.5">FLOWCRAFT</text>`,
    `<text x="${W - pad - 14}" y="${pad + 42}" font-size="9.5" fill="${F.sub}" text-anchor="end">SOPConnect</text>`,
  ];
}

function drawNode(n: Node, compact: boolean, numberLabel: boolean): string {
  const F = FCP;
  const [fill, stroke] = F[n.t];
  const x = n.cx - n.w / 2, y0 = n.cy - n.h / 2;
  let shape: string;
  if (n.t === 'decision') shape = `<polygon points="${n.cx},${y0} ${x + n.w},${n.cy} ${n.cx},${y0 + n.h} ${x},${n.cy}" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>`;
  else if (n.t === 'start' || n.t === 'end') shape = `<rect x="${x}" y="${y0}" width="${n.w}" height="${n.h}" rx="${n.h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>`;
  else if (n.t === 'document') shape = `<path d="M${x},${y0} H${x + n.w} V${y0 + n.h - 8} C${x + n.w * 0.72},${y0 + n.h - 20} ${x + n.w * 0.3},${y0 + n.h + 6} ${x},${y0 + n.h - 7} Z" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>`;
  else shape = `<rect x="${x}" y="${y0}" width="${n.w}" height="${n.h}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>`;
  const dy = n.t === 'document' ? -4 : 0;
  const txt = n.lines.map((ln, j) => `<text x="${n.cx}" y="${n.cy + 4 + dy + (j - (n.lines.length - 1) / 2) * 14}" font-size="${compact ? 12 : 11.5}" fill="${F.ink}" text-anchor="middle">${esc(ln)}</text>`).join('');
  const num = numberLabel ? `<text x="${x}" y="${y0 - 5}" font-size="9.5" fill="${F.sub}">#${n.i + 1}</text>` : '';
  return `<g class="fc-node" data-step="${esc(n.s.id)}">${shape}${txt}${num}</g>`;
}

function edgePath(pts: number[][]): string {
  return `<path d="M${pts.map((p) => p.join(',')).join(' L')}" fill="none" stroke="${FCP.line}" stroke-width="1.4" stroke-linejoin="round" marker-end="url(#fc-ah)"/>`;
}

function edgeLabel(x: number, y: number, anchor: 'start' | 'end' | 'middle', t: string): string {
  return `<text x="${x}" y="${y}" font-size="10.5" font-weight="bold" fill="${t === 'Ya' ? '#2B7A50' : '#B13A2C'}" text-anchor="${anchor}" paint-order="stroke" stroke="#FFFFFF" stroke-width="3">${t}</text>`;
}

function legend(pad: number, ly: number): string[] {
  const F = FCP;
  const o: string[] = [];
  let lx = pad;
  o.push(`<text x="${lx}" y="${ly + 13}" font-size="10.5" font-weight="bold" fill="${F.sub}">Simbol:</text>`);
  lx += 52;
  const items: [StepType, string][] = [['start', 'Mulai / Selesai'], ['process', 'Proses'], ['decision', 'Keputusan'], ['document', 'Dokumen']];
  for (const [t, l] of items) {
    const [f, s] = F[t];
    const sh = t === 'decision' ? `<polygon points="${lx + 11},${ly + 2} ${lx + 22},${ly + 10} ${lx + 11},${ly + 18} ${lx},${ly + 10}" fill="${f}" stroke="${s}" stroke-width="1.3"/>`
      : t === 'start' ? `<rect x="${lx}" y="${ly + 3}" width="22" height="13" rx="6.5" fill="${f}" stroke="${s}" stroke-width="1.3"/>`
      : t === 'document' ? `<path d="M${lx},${ly + 3} H${lx + 22} V${ly + 14} C${lx + 15},${ly + 10} ${lx + 7},${ly + 20} ${lx},${ly + 15} Z" fill="${f}" stroke="${s}" stroke-width="1.3"/>`
      : `<rect x="${lx}" y="${ly + 3}" width="22" height="14" rx="2" fill="${f}" stroke="${s}" stroke-width="1.3"/>`;
    o.push(sh + `<text x="${lx + 28}" y="${ly + 13}" font-size="10.5" fill="${F.ink}">${l}</text>`);
    lx += 30 + l.length * 6 + 18;
  }
  return o;
}

/** Menyusun flowchart swimlane sebagai string SVG mandiri. */
export function renderFlow(doc: RenderInput, opt: RenderOptions = {}): { svg: string; width: number; height: number } {
  return (opt.orientation ?? 'horizontal') === 'vertical' ? renderVertical(doc, opt) : renderHorizontal(doc, opt);
}

/**
 * Swimlane horizontal: setiap langkah menempati satu kolom (kiri→kanan), setiap pelaksana satu baris.
 * Karena tiap kolom hanya berisi satu simbol, garis vertikal di tengah kolom dan di celah antarkolom
 * tidak pernah menabrak simbol lain; garis memutar berjalan di "jalur" atas/bawah baris pelaksana.
 */
function renderHorizontal(doc: RenderInput, opt: RenderOptions) {
  const steps = doc.steps || [];
  const compact = !!opt.compact;
  const table = !compact && opt.table !== false;
  const F = FCP;
  const lanes = laneList(steps.length ? steps : [{ lane: 'Pelaksana' }]);
  const pad = compact ? 8 : 20, titleH = compact ? 0 : 76, legendH = compact ? 0 : 46;
  const leftW = compact ? 46 : table ? 70 : 52;
  const n = Math.max(1, steps.length);
  const colW = compact ? 184 : Math.max(196, Math.floor((720 - leftW - 2 * pad) / n));
  const left0 = pad + leftW;
  const W = left0 + n * colW + pad;

  const nodes = steps.map((s, i) => measure(s, i, lanes.indexOf(laneName(s))));
  const headLines = table ? steps.map((s) => wrap(stepText(s), Math.floor((colW - 20) / 6.4), 4)) : [];
  const headH = compact ? 0 : table ? Math.max(56, Math.max(1, ...headLines.map((l) => l.length)) * 14 + 36) : 30;
  const laneMaxH = lanes.map((_, k) => Math.max(38, ...nodes.filter((x) => x.lane === k).map((x) => x.h)));
  const laneH = laneMaxH.map((h) => Math.max(compact ? 70 : 128, h + (compact ? 28 : 84)));
  const outLines = table ? steps.map((s) => wrap(s.output, Math.floor((colW - 20) / 6.2), 4)) : [];
  const outH = table ? Math.max(40, Math.max(0, ...outLines.map((l) => l.length)) * 14 + 22) : 0;
  const timeH = table ? 36 : 0;

  const top0 = pad + titleH;
  const lanesTop = top0 + headH;
  const laneTop: number[] = [];
  let y = lanesTop;
  for (const h of laneH) { laneTop.push(y); y += h; }
  const lanesBottom = y;
  const bodyBottom = lanesBottom + outH + timeH;
  const H = bodyBottom + legendH + pad;
  for (const nd of nodes) { nd.cx = left0 + nd.i * colW + colW / 2; nd.cy = laneTop[nd.lane] + laneH[nd.lane] / 2; }

  const o = svgOpen(W, H);
  if (!compact) o.push(...titleBlock(doc, W, pad, titleH));

  // baris pelaksana + label vertikal di kiri
  lanes.forEach((l, k) => {
    o.push(`<rect x="${pad}" y="${laneTop[k]}" width="${W - 2 * pad}" height="${laneH[k]}" fill="${k % 2 ? '#FAFBFD' : F.paper}" stroke="${F.grid}"/>`);
    o.push(`<rect x="${pad}" y="${laneTop[k]}" width="${leftW}" height="${laneH[k]}" fill="${F.head}" stroke="${F.grid}"/>`);
    const lx = pad + leftW / 2, ly = laneTop[k] + laneH[k] / 2;
    const ll = wrap(l, Math.max(6, Math.floor((laneH[k] - 16) / 7.2)), 2);
    ll.forEach((ln, j) => {
      const ox = lx + (j - (ll.length - 1) / 2) * 14 + 4;
      o.push(`<text x="${ox}" y="${ly}" transform="rotate(-90 ${ox} ${ly})" font-size="${compact ? 13 : 11.5}" font-weight="bold" fill="${F.headInk}" text-anchor="middle">${esc(ln)}</text>`);
    });
  });
  // garis pemisah antarkolom kegiatan
  for (let i = 1; i < n; i++) {
    const x = left0 + i * colW;
    o.push(`<line x1="${x}" x2="${x}" y1="${top0}" y2="${table ? bodyBottom : lanesBottom}" stroke="${F.grid}" ${table ? '' : 'stroke-dasharray="3 4"'}/>`);
  }
  // header kegiatan (horizontal, di atas)
  if (!compact) {
    o.push(`<rect x="${pad}" y="${top0}" width="${W - 2 * pad}" height="${headH}" fill="${F.head}" stroke="${F.grid}"/>`);
    o.push(`<text x="${pad + leftW / 2}" y="${top0 + headH / 2 + 4}" font-size="10" font-weight="bold" fill="${F.sub}" text-anchor="middle">${table ? 'Kegiatan' : 'No'}</text>`);
    steps.forEach((_s, i) => {
      const cx = left0 + i * colW + colW / 2;
      if (i > 0) o.push(`<line x1="${left0 + i * colW}" x2="${left0 + i * colW}" y1="${top0}" y2="${top0 + headH}" stroke="${F.grid}"/>`);
      if (table) {
        o.push(`<circle cx="${left0 + i * colW + 16}" cy="${top0 + 16}" r="9" fill="${F.paper}" stroke="${F.grid}"/>`);
        o.push(`<text x="${left0 + i * colW + 16}" y="${top0 + 19.5}" font-size="10" font-weight="bold" fill="${F.headInk}" text-anchor="middle">${i + 1}</text>`);
        const hl = headLines[i];
        hl.forEach((ln, j) => o.push(`<text x="${cx}" y="${top0 + headH / 2 + 10 + (j - (hl.length - 1) / 2) * 14}" font-size="11" font-weight="bold" fill="${F.headInk}" text-anchor="middle">${esc(ln)}</text>`));
      } else {
        o.push(`<text x="${cx}" y="${top0 + headH / 2 + 4}" font-size="11" font-weight="bold" fill="${F.headInk}" text-anchor="middle">${i + 1}</text>`);
      }
    });
  }
  // baris Output & Waktu (bawah)
  if (table) {
    const rows: [string, number, number][] = [['Output', lanesBottom, outH], ['Waktu', lanesBottom + outH, timeH]];
    for (const [label, ry, rh] of rows) {
      o.push(`<rect x="${pad}" y="${ry}" width="${W - 2 * pad}" height="${rh}" fill="${F.paper}" stroke="${F.grid}"/>`);
      o.push(`<rect x="${pad}" y="${ry}" width="${leftW}" height="${rh}" fill="${F.head}" stroke="${F.grid}"/>`);
      o.push(`<text x="${pad + leftW / 2}" y="${ry + rh / 2 + 4}" font-size="10" font-weight="bold" fill="${F.headInk}" text-anchor="middle">${label}</text>`);
    }
    steps.forEach((s, i) => {
      const cx = left0 + i * colW + colW / 2;
      const ol = outLines[i];
      ol.forEach((ln, j) => o.push(`<text x="${cx}" y="${lanesBottom + outH / 2 + 4 + (j - (ol.length - 1) / 2) * 14}" font-size="10.5" fill="${F.ink}" text-anchor="middle">${esc(ln)}</text>`));
      if (s.time) o.push(`<text x="${cx}" y="${lanesBottom + outH + timeH / 2 + 4}" font-size="10.5" fill="${F.ink}" text-anchor="middle">${esc(wrap(s.time, 26, 1)[0])}</text>`);
    });
  }

  // garis penghubung
  const chan: Record<string, number> = {};
  const usedSide: Record<number, 'T' | 'B'> = {};
  const chY = (lane: number, side: 'T' | 'B') => {
    const key = lane + side;
    const k = (chan[key] = (chan[key] || 0) + 1);
    const base = laneTop[lane] + laneH[lane] / 2;
    const off = Math.min(laneMaxH[lane] / 2 + 12 + (k - 1) * 7, laneH[lane] / 2 - 5);
    return side === 'B' ? base + off : base - off;
  };
  const labels: string[] = [];
  const edges = edgesOf(steps).sort((a, b) => (a.kind === 'no' ? 0 : 1) - (b.kind === 'no' ? 0 : 1));
  for (const e of edges) {
    const a = nodes[e.from], b = nodes[e.to];
    let pts: number[][];
    if (e.to === e.from + 1 && e.kind !== 'no') {
      const sx = a.cx + a.w / 2, sy = a.cy, tx = b.cx - b.w / 2, ty = b.cy;
      if (sy === ty) pts = [[sx, sy], [tx, ty]];
      else { const gx = Math.round((sx + tx) / 2); pts = [[sx, sy], [gx, sy], [gx, ty], [tx, ty]]; }
      if (e.label) labels.push(edgeLabel(sx + 5, sy - 6, 'start', e.label));
    } else {
      let side: 'T' | 'B' = b.lane > a.lane ? 'B' : b.lane < a.lane ? 'T' : 'B';
      if (a.t === 'decision') { if (usedSide[a.i] === side) side = side === 'B' ? 'T' : 'B'; usedSide[a.i] = side; }
      const sx = a.cx, sy = side === 'B' ? a.cy + a.h / 2 : a.cy - a.h / 2, cy = chY(a.lane, side);
      const tx = b.cx, ty = cy > b.cy ? b.cy + b.h / 2 : b.cy - b.h / 2;
      pts = [[sx, sy], [sx, cy], [tx, cy], [tx, ty]];
      if (e.label) labels.push(edgeLabel(sx + 6, side === 'B' ? sy + 13 : sy - 5, 'start', e.label));
    }
    o.push(edgePath(pts));
  }
  for (const nd of nodes) o.push(drawNode(nd, compact, false));
  o.push(...labels);
  if (!compact) o.push(...legend(pad, bodyBottom + 16));
  o.push('</svg>');
  return { svg: o.join(''), width: W, height: H };
}

/**
 * Swimlane vertikal (format tabel SOP klasik): setiap langkah satu baris, kolom = pelaksana.
 * Karena tiap baris hanya berisi satu simbol, garis horizontal di tengah baris dan di celah antarbaris
 * tidak pernah menabrak simbol lain.
 */
function renderVertical(doc: RenderInput, opt: RenderOptions) {
  const steps = doc.steps || [];
  const compact = !!opt.compact;
  const table = !compact && opt.table !== false;
  const lanes = laneList(steps.length ? steps : [{ lane: 'Pelaksana' }]);
  const colNo = table ? 40 : 0, colAct = table ? 214 : 0, colOut = table ? 156 : 0, colTime = table ? 86 : 0;
  const laneW = compact ? 200 : Math.max(200, Math.floor((680 - colNo - colAct - colOut - colTime - 40) / lanes.length));
  const pad = compact ? 8 : 20, titleH = compact ? 0 : 76, headH = 44, legendH = compact ? 0 : 46;
  const left0 = pad + colNo + colAct;
  const W = left0 + lanes.length * laneW + colOut + colTime + pad;
  const F = FCP;

  const nodes = steps.map((s, i) => measure(s, i, lanes.indexOf(laneName(s))));
  const rows = nodes.map((nd) => {
    const act = table ? wrap(stepText(nd.s), 33, 7) : [];
    const out = table ? wrap(nd.s.output, 23, 6) : [];
    const tm = table ? wrap(nd.s.time, 11, 3) : [];
    const rowH = Math.max(nd.h + (compact ? 24 : 40), act.length * 15 + 26, out.length * 15 + 26, compact ? 56 : 84);
    return { act, out, tm, rowH, top: 0 };
  });
  let y = pad + titleH + headH;
  nodes.forEach((nd, i) => { rows[i].top = y; nd.cy = y + rows[i].rowH / 2; y += rows[i].rowH; nd.cx = left0 + nd.lane * laneW + laneW / 2; });
  const bodyTop = pad + titleH;
  const bodyBottom = Math.max(y, bodyTop + headH + 80);
  const H = bodyBottom + legendH + pad;

  const o = svgOpen(W, H);
  if (!compact) o.push(...titleBlock(doc, W, pad, titleH));

  type Col = { x: number; w: number; t: string; lane?: boolean };
  const cols: Col[] = [];
  if (table) { cols.push({ x: pad, w: colNo, t: 'No' }); cols.push({ x: pad + colNo, w: colAct, t: 'Kegiatan' }); }
  lanes.forEach((l, k) => cols.push({ x: left0 + k * laneW, w: laneW, t: l, lane: true }));
  if (table) {
    const rx = left0 + lanes.length * laneW;
    cols.push({ x: rx, w: colOut, t: 'Output' });
    cols.push({ x: rx + colOut, w: colTime, t: 'Waktu' });
  }
  cols.forEach((c, k) => {
    o.push(`<rect x="${c.x}" y="${bodyTop}" width="${c.w}" height="${bodyBottom - bodyTop}" fill="${c.lane && k % 2 ? '#FAFBFD' : F.paper}" stroke="${F.grid}"/>`);
    o.push(`<rect x="${c.x}" y="${bodyTop}" width="${c.w}" height="${headH}" fill="${F.head}" stroke="${F.grid}"/>`);
    const hl = wrap(c.t, Math.floor(c.w / 7.2), 2);
    hl.forEach((ln, j) =>
      o.push(`<text x="${c.x + c.w / 2}" y="${bodyTop + headH / 2 + 4 + (j - (hl.length - 1) / 2) * 13}" font-size="${compact ? 13 : 11.5}" font-weight="bold" fill="${F.headInk}" text-anchor="middle">${esc(ln)}</text>`));
  });

  nodes.forEach((nd, i) => {
    const r = rows[i];
    if (i > 0) o.push(`<line x1="${pad}" x2="${W - pad}" y1="${r.top}" y2="${r.top}" stroke="${F.grid}" ${table ? '' : 'stroke-dasharray="3 4"'}/>`);
    if (table) {
      const rx = left0 + lanes.length * laneW;
      o.push(`<text x="${pad + colNo / 2}" y="${nd.cy + 4}" font-size="11.5" fill="${F.sub}" text-anchor="middle">${i + 1}</text>`);
      r.act.forEach((ln, j) => o.push(`<text x="${pad + colNo + 10}" y="${nd.cy + 4 + (j - (r.act.length - 1) / 2) * 15}" font-size="11.5" fill="${F.ink}">${esc(ln)}</text>`));
      r.out.forEach((ln, j) => o.push(`<text x="${rx + 10}" y="${nd.cy + 4 + (j - (r.out.length - 1) / 2) * 15}" font-size="11" fill="${F.ink}">${esc(ln)}</text>`));
      r.tm.forEach((ln, j) => o.push(`<text x="${rx + colOut + colTime / 2}" y="${nd.cy + 4 + (j - (r.tm.length - 1) / 2) * 15}" font-size="11" fill="${F.ink}" text-anchor="middle">${esc(ln)}</text>`));
    }
  });

  const chan: Record<string, number> = {};
  const usedSide: Record<number, 'L' | 'R'> = {};
  const chX = (lane: number, side: 'L' | 'R') => {
    const key = lane + side;
    const k = (chan[key] = (chan[key] || 0) + 1);
    const base = left0 + lane * laneW + laneW / 2;
    const off = Math.min(NODE_W / 2 + 12 + (k - 1) * 7, laneW / 2 - 5);
    return side === 'R' ? base + off : base - off;
  };
  const labels: string[] = [];
  const edges = edgesOf(steps).sort((a, b) => (a.kind === 'no' ? 0 : 1) - (b.kind === 'no' ? 0 : 1));
  for (const e of edges) {
    const a = nodes[e.from], b = nodes[e.to];
    let pts: number[][];
    if (e.to === e.from + 1 && e.kind !== 'no') {
      const sx = a.cx, sy = a.cy + a.h / 2, tx = b.cx, ty = b.cy - b.h / 2;
      if (sx === tx) pts = [[sx, sy], [tx, ty]];
      else { const gy = Math.round((sy + ty) / 2); pts = [[sx, sy], [sx, gy], [tx, gy], [tx, ty]]; }
      if (e.label) labels.push(edgeLabel(sx + 7, sy + 14, 'start', e.label));
    } else {
      let side: 'L' | 'R' = b.lane > a.lane ? 'R' : b.lane < a.lane ? 'L' : 'R';
      if (a.t === 'decision') { if (usedSide[a.i] === side) side = side === 'R' ? 'L' : 'R'; usedSide[a.i] = side; }
      const sx = side === 'R' ? a.cx + a.w / 2 : a.cx - a.w / 2, sy = a.cy, cx = chX(a.lane, side);
      const tx = cx > b.cx ? b.cx + b.w / 2 : b.cx - b.w / 2, ty = b.cy;
      pts = [[sx, sy], [cx, sy], [cx, ty], [tx, ty]];
      if (e.label) labels.push(edgeLabel(side === 'R' ? sx + 6 : sx - 6, sy - 7, side === 'R' ? 'start' : 'end', e.label));
    }
    o.push(edgePath(pts));
  }
  for (const nd of nodes) o.push(drawNode(nd, compact, !table && !compact));
  o.push(...labels);
  if (!compact) o.push(...legend(pad, bodyBottom + 16));
  o.push('</svg>');
  return { svg: o.join(''), width: W, height: H };
}
