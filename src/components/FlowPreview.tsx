import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { renderFlow, validate, type RenderInput } from '../lib/flow';
import { exportJson, exportPng, exportSvg, printFlow } from '../lib/exporter';
import { Icon, errMsg, useToast } from './ui';

interface Props {
  doc: RenderInput & { code?: string; unit?: string; description?: string };
  onNodeClick: (stepId: string) => void;
}

export default function FlowPreview({ doc, onNodeClick }: Props) {
  const toast = useToast();
  const [table, setTable] = useState(() => localStorage.getItem('fc-table') !== '0');
  const [zoom, setZoom] = useState(1);
  const fitted = useRef(false);
  const canvas = useRef<HTMLDivElement>(null);
  const deferred = useDeferredValue(doc);
  const r = useMemo(() => renderFlow(deferred, { table }), [deferred, table]);
  const issues = useMemo(() => validate(deferred.steps), [deferred.steps]);

  const fit = () => {
    const w = canvas.current?.clientWidth ?? 800;
    setZoom(Math.max(0.3, Math.min(1, (w - 40) / r.width)));
  };
  useLayoutEffect(() => { if (!fitted.current && r.width) { fitted.current = true; fit(); } });
  useEffect(() => { try { localStorage.setItem('fc-table', table ? '1' : '0'); } catch { /* abaikan */ } }, [table]);

  const svg = r.svg.replace(/ width="(\d+(?:\.\d+)?)" height="(\d+(?:\.\d+)?)"/, ` width="${Math.round(r.width * zoom)}" height="${Math.round(r.height * zoom)}"`);

  return (
    <section className="preview" aria-label="Pratinjau flowchart">
      <div className="pv-bar">
        <div className="zoom">
          <button onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.15).toFixed(2)))} aria-label="Perkecil">−</button>
          <span className="mono">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))} aria-label="Perbesar">+</button>
        </div>
        <button className="btn sm" onClick={fit}>Sesuaikan</button>
        <label className="check"><input type="checkbox" checked={table} onChange={(e) => { setTable(e.target.checked); fitted.current = false; }} /> Format tabel SOP</label>
        <span className="spacer" />
        <button className="btn sm" onClick={() => exportPng(doc, table).catch((e) => toast(errMsg(e), 'err'))}><Icon name="dl" />PNG</button>
        <button className="btn sm" onClick={() => exportSvg(doc, table)}><Icon name="dl" />SVG</button>
        <button className="btn sm" onClick={() => { if (!printFlow(doc, table)) toast('Izinkan pop-up untuk mencetak.', 'err'); }}><Icon name="print" />Cetak / PDF</button>
        <button className="btn sm ghost" onClick={() => exportJson(doc)}><Icon name="dl" />JSON</button>
      </div>
      <div className="issues">
        {issues.length === 0
          ? <span className="issue ok">Alur lengkap: ada Mulai, Selesai, dan semua langkah terhubung</span>
          : issues.slice(0, 8).map((x, k) => (
            <button key={k} className={'issue' + (x.level === 'err' ? ' err' : '')} onClick={() => x.stepId && onNodeClick(x.stepId)}>{x.message}</button>
          ))}
        {issues.length > 8 && <span className="note">+{issues.length - 8} lainnya</span>}
      </div>
      <div className="canvas" ref={canvas} dangerouslySetInnerHTML={{ __html: svg }}
        onClick={(e) => { const g = (e.target as Element).closest('.fc-node'); if (g) onNodeClick(g.getAttribute('data-step') || ''); }} />
    </section>
  );
}
