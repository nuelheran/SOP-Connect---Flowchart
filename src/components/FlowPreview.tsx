import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { renderFlow, validate, type Orientation, type RenderInput } from '../lib/flow';
import { exportJson, exportPng, exportSvg, printFlow } from '../lib/exporter';
import { Dropdown, Icon, errMsg, useToast } from './ui';

interface Props {
  doc: RenderInput & { code?: string; unit?: string; description?: string };
  onNodeClick: (stepId: string) => void;
}

const read = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* abaikan */ } };

/** Orientasi & format terakhir yang dipilih pengguna (dipakai juga oleh pratinjau versi). */
export function preferredView(): { orientation: Orientation; table: boolean } {
  return { orientation: read('fc-orient', 'horizontal') === 'vertical' ? 'vertical' : 'horizontal', table: read('fc-table', '1') !== '0' };
}

export default function FlowPreview({ doc, onNodeClick }: Props) {
  const toast = useToast();
  const [table, setTable] = useState(() => preferredView().table);
  const [orientation, setOrientation] = useState<Orientation>(() => preferredView().orientation);
  const [zoom, setZoom] = useState(1);
  const fitted = useRef(false);
  const canvas = useRef<HTMLDivElement>(null);
  const deferred = useDeferredValue(doc);
  const r = useMemo(() => renderFlow(deferred, { table, orientation }), [deferred, table, orientation]);
  const issues = useMemo(() => validate(deferred.steps), [deferred.steps]);

  const fit = () => {
    const el = canvas.current;
    const w = (el?.clientWidth ?? 800) - 40, h = (el?.clientHeight ?? 600) - 40;
    // horizontal: penuhi tinggi area (gulir ke samping); vertikal: penuhi lebar (gulir ke bawah)
    const z = orientation === 'horizontal' ? Math.max(w / r.width, Math.max(h, 360) / r.height) : w / r.width;
    setZoom(Math.max(0.25, Math.min(1, +z.toFixed(2))));
  };
  useLayoutEffect(() => { if (!fitted.current && r.width) { fitted.current = true; fit(); } });
  useEffect(() => { write('fc-table', table ? '1' : '0'); write('fc-orient', orientation); }, [table, orientation]);

  const svg = r.svg.replace(/ width="(\d+(?:\.\d+)?)" height="(\d+(?:\.\d+)?)"/, ` width="${Math.round(r.width * zoom)}" height="${Math.round(r.height * zoom)}"`);
  const errs = issues.filter((x) => x.level === 'err').length;

  return (
    <section className="preview glass" aria-label="Pratinjau flowchart">
      <div className="pv-bar">
        <div className="seg sm" role="group" aria-label="Orientasi flowchart">
          <button aria-pressed={orientation === 'horizontal'} onClick={() => { setOrientation('horizontal'); fitted.current = false; }} title="Alur kiri ke kanan, pelaksana sebagai baris"><Icon name="rows" />Horizontal</button>
          <button aria-pressed={orientation === 'vertical'} onClick={() => { setOrientation('vertical'); fitted.current = false; }} title="Alur atas ke bawah, pelaksana sebagai kolom"><Icon name="cols" />Vertikal</button>
        </div>
        <label className="switch" title="Tampilkan kegiatan, output, dan waktu seperti tabel SOP"><input type="checkbox" checked={table} onChange={(e) => { setTable(e.target.checked); fitted.current = false; }} />Tabel SOP</label>
        <span className="spacer" />
        <div className="zoom">
          <button onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.1).toFixed(2)))} aria-label="Perkecil">−</button>
          <span className="mono">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.1).toFixed(2)))} aria-label="Perbesar">+</button>
        </div>
        <button className="btn sm" onClick={fit} title="Sesuaikan dengan layar">Pas layar</button>
        <Dropdown label={<><Icon name="dl" />Unduh</>}>
          {(close) => (
            <>
              <button role="menuitem" onClick={() => { close(); exportPng(doc, table, orientation).catch((e) => toast(errMsg(e), 'err')); }}><Icon name="image" /><span>Gambar PNG<small>Untuk ditempel di dokumen SOP</small></span></button>
              <button role="menuitem" onClick={() => { close(); exportSvg(doc, table, orientation); }}><Icon name="flow" /><span>Vektor SVG<small>Tajam di Word, Visio, draw.io</small></span></button>
              <button role="menuitem" onClick={() => { close(); if (!printFlow(doc, table, orientation)) toast('Izinkan pop-up untuk mencetak.', 'err'); }}><Icon name="print" /><span>Cetak / PDF<small>Kertas A4, otomatis lanskap</small></span></button>
              <button role="menuitem" onClick={() => { close(); exportJson(doc); }}><Icon name="code" /><span>Data JSON<small>Cadangan, bisa diimpor ulang</small></span></button>
            </>
          )}
        </Dropdown>
      </div>
      <div className="issues" aria-live="polite">
        {issues.length === 0
          ? <span className="issue ok">Alur lengkap: ada Mulai, Selesai, dan semua langkah terhubung</span>
          : <>
            {issues.slice(0, 6).map((x, k) => (
              <button key={k} className={'issue' + (x.level === 'err' ? ' err' : '')} onClick={() => x.stepId && onNodeClick(x.stepId)} title="Klik untuk menuju langkah">{x.message}</button>
            ))}
            {issues.length > 6 && <span className="note">+{issues.length - 6} lainnya</span>}
            {errs === 0 && <span className="note">Peringatan saja; flowchart tetap bisa diunduh.</span>}
          </>}
      </div>
      <div className="canvas" ref={canvas} dangerouslySetInnerHTML={{ __html: svg }} title="Klik simbol untuk mengedit langkahnya"
        onClick={(e) => { const g = (e.target as Element).closest('.fc-node'); if (g) onNodeClick(g.getAttribute('data-step') || ''); }} />
    </section>
  );
}
