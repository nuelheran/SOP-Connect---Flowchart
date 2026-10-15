import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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

const MIN_Z = 0.2, MAX_Z = 3, PAD = 20;
const clampZ = (z: number) => Math.min(MAX_Z, Math.max(MIN_Z, +z.toFixed(3)));

export default function FlowPreview({ doc, onNodeClick }: Props) {
  const toast = useToast();
  const [table, setTable] = useState(() => preferredView().table);
  const [orientation, setOrientation] = useState<Orientation>(() => preferredView().orientation);
  const [zoom, setZoom] = useState(1);
  const [panning, setPanning] = useState(false);
  const zoomRef = useRef(1);
  const fitted = useRef(false);
  const canvas = useRef<HTMLDivElement>(null);
  /** Titik flowchart yang harus tetap di bawah kursor setelah zoom. */
  const anchor = useRef<{ mx: number; my: number; cx: number; cy: number } | null>(null);
  const dragged = useRef(false);
  const deferred = useDeferredValue(doc);
  const r = useMemo(() => renderFlow(deferred, { table, orientation }), [deferred, table, orientation]);
  const issues = useMemo(() => validate(deferred.steps), [deferred.steps]);

  /** Zoom ke `nz`, menjaga titik di bawah kursor (atau tengah kanvas) tetap di tempat. */
  const zoomTo = useCallback((nz: number, clientX?: number, clientY?: number) => {
    const el = canvas.current;
    const z = zoomRef.current;
    nz = clampZ(nz);
    if (!el || nz === z) return;
    const rect = el.getBoundingClientRect();
    const mx = clientX != null ? clientX - rect.left : el.clientWidth / 2;
    const my = clientY != null ? clientY - rect.top : el.clientHeight / 2;
    anchor.current = { mx, my, cx: (el.scrollLeft + mx - PAD) / z, cy: (el.scrollTop + my - PAD) / z };
    zoomRef.current = nz;
    setZoom(nz);
  }, []);

  const fit = useCallback(() => {
    const el = canvas.current;
    const w = (el?.clientWidth ?? 800) - 2 * PAD, h = (el?.clientHeight ?? 600) - 2 * PAD;
    // horizontal: penuhi tinggi area (gulir ke samping); vertikal: penuhi lebar (gulir ke bawah)
    const z = orientation === 'horizontal' ? Math.max(w / r.width, Math.max(h, 360) / r.height) : w / r.width;
    const nz = clampZ(Math.min(1, z));
    anchor.current = null;
    zoomRef.current = nz; setZoom(nz);
    if (el) { el.scrollLeft = 0; el.scrollTop = 0; }
  }, [orientation, r.width, r.height]);

  useLayoutEffect(() => { if (!fitted.current && r.width) { fitted.current = true; fit(); } });
  useEffect(() => { write('fc-table', table ? '1' : '0'); write('fc-orient', orientation); }, [table, orientation]);

  // Ukuran SVG diatur langsung (tanpa membangun ulang DOM) agar zoom terasa mulus.
  useLayoutEffect(() => {
    const el = canvas.current;
    const svg = el?.querySelector('svg');
    if (!el || !svg) return;
    svg.setAttribute('width', String(Math.round(r.width * zoom)));
    svg.setAttribute('height', String(Math.round(r.height * zoom)));
    const a = anchor.current;
    if (a) {
      el.scrollLeft = a.cx * zoom + PAD - a.mx;
      el.scrollTop = a.cy * zoom + PAD - a.my;
      anchor.current = null;
    }
  }, [zoom, r]);

  // Roda mouse: Ctrl/⌘ + scroll (atau cubit di touchpad) = zoom; scroll biasa = gulir.
  // Bila flowchart tidak bisa digulir ke bawah tapi bisa ke samping (swimlane horizontal), scroll biasa menggulir ke samping.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
        zoomTo(zoomRef.current * Math.exp(-e.deltaY * unit * 0.0022), e.clientX, e.clientY);
        return;
      }
      const canY = el.scrollHeight > el.clientHeight + 1, canX = el.scrollWidth > el.clientWidth + 1;
      if (!e.shiftKey && !canY && canX && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomTo]);

  // Seret dengan tombol kiri (atau tombol tengah) untuk menggeser kanvas.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' || (e.button !== 0 && e.button !== 1)) return;
    const el = canvas.current!;
    const sx = e.clientX, sy = e.clientY, sl = el.scrollLeft, st = el.scrollTop;
    dragged.current = false;
    if (e.button === 1) e.preventDefault();
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!dragged.current && Math.hypot(dx, dy) < 4) return;
      if (!dragged.current) { dragged.current = true; setPanning(true); }
      el.scrollLeft = sl - dx; el.scrollTop = st - dy;
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      setPanning(false);
      // klik setelah menyeret tidak dianggap memilih langkah
      setTimeout(() => { dragged.current = false; }, 0);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomTo(zoomRef.current * 1.2); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomTo(zoomRef.current / 1.2); }
    else if (e.key === '0') { e.preventDefault(); zoomTo(1); }
  };

  const errs = issues.filter((x) => x.level === 'err').length;
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

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
          <button onClick={() => zoomTo(zoomRef.current / 1.2)} aria-label="Perkecil" title="Perkecil (−)"><Icon name="zout" /></button>
          <button className="pct" onClick={() => zoomTo(1)} title="Kembali ke 100% (0)">{Math.round(zoom * 100)}%</button>
          <button onClick={() => zoomTo(zoomRef.current * 1.2)} aria-label="Perbesar" title="Perbesar (+)"><Icon name="zin" /></button>
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
      <div className="canvas-wrap">
        <div className={'canvas' + (panning ? ' panning' : '')} ref={canvas} tabIndex={0} aria-label="Kanvas flowchart. Tombol plus dan minus untuk zoom."
          dangerouslySetInnerHTML={{ __html: r.svg }}
          onPointerDown={onPointerDown} onKeyDown={onKeyDown}
          onAuxClick={(e) => { if (e.button === 1) e.preventDefault(); }}
          onClick={(e) => {
            if (dragged.current) return;
            const g = (e.target as Element).closest('.fc-node');
            if (g) onNodeClick(g.getAttribute('data-step') || '');
          }} />
        <div className="canvas-hint glass" aria-hidden="true">
          <span><kbd>{isMac ? '⌘' : 'Ctrl'}</kbd> + scroll: zoom</span>
          <span><Icon name="hand" /> seret: geser</span>
          <span>klik simbol: edit langkah</span>
        </div>
      </div>
    </section>
  );
}
