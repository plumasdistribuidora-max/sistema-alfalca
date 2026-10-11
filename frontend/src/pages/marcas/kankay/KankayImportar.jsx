import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../../api';
import { fmt, num, mesN, MES } from './kankayUtils';
import './kankay.css';

const fecha = s => `${s.slice(8)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

// Subir la "Consulta de ventas detallada" de Dux. Los días que trae reemplazan a los que había.
export function KankayImportar() {
  const [file, setFile] = useState(null);
  const [over, setOver] = useState(false);
  const [estado, setEstado] = useState('idle'); // idle | subiendo | listo | error
  const [res, setRes] = useState(null);
  const [error, setError] = useState('');
  const ref = useRef();

  const elegir = f => { if (f && /\.xlsx?$/i.test(f.name)) { setFile(f); setError(''); } else if (f) setError('Tiene que ser un Excel (.xls o .xlsx).'); };
  const reset = () => { setFile(null); setEstado('idle'); setRes(null); setError(''); if (ref.current) ref.current.value = ''; };

  async function subir() {
    if (!file) return;
    setEstado('subiendo'); setError('');
    const fd = new FormData(); fd.append('archivo', file);
    try {
      const r = await api.post('/kankay/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setRes(r.data.data); setEstado('listo');
    } catch (err) { setError(err.response?.data?.error || 'No se pudo procesar el Excel'); setEstado('error'); }
  }

  return (
    <div className="kk" style={{ maxWidth: 720 }}>
      <h1 className="text-xl font-bold text-stone-900">Importar ventas de Kankay</h1>
      {estado === 'listo' && res ? (
        <div className="card" style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><span style={{ fontSize: 22 }}>✓</span>
            <div><b>Import completado</b><div className="mut" style={{ fontSize: 13 }}>{fecha(res.desde)} → {fecha(res.hasta)} · {res.archivo}</div></div></div>
          <div className="rb">
            <div><b>{res.renglones}</b><span>Renglones</span></div>
            <div className="g"><b>{res.ventas}</b><span>Ventas</span></div>
            <div><b>{num(res.unidades)}</b><span>Unidades</span></div>
            <div><b>{res.productos}</b><span>Productos distintos</span></div>
            <div><b>{fmt(res.neto)}</b><span>Venta sin IVA</span></div>
            <div><b>{fmt(res.cmv)}</b><span>Costo de mercadería</span></div>
          </div>
          <div>
            <div className="ok"><i>✓</i><span>Ventas del {fecha(res.desde)} al {fecha(res.hasta)}.</span></div>
            <div className="ok"><i>✓</i><span>{res.diasReemplazados ? `Reemplazó ${res.diasReemplazados} ${res.diasReemplazados === 1 ? 'día que ya estaba cargado' : 'días que ya estaban cargados'}: no se duplicó nada.` : 'No había días repetidos: no se reemplazó nada.'}</span></div>
            {res.sinNumero > 0 && <div className="ok"><i>✓</i><span>{res.sinNumero} {res.sinNumero === 1 ? 'renglón' : 'renglones'} sin número de comprobante: van como sin factura, completos.</span></div>}
            <div className="ok"><i>✓</i><span>El estado de resultados de {res.meses.map(mesN).join(' y ')} se actualizó: ventas y costo por rubro.</span></div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link to="/marcas/kankay" className="btn-primary">Ver el dashboard</Link>
            <button type="button" className="btn-secondary" onClick={reset}>Importar otro</button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ display: 'grid', gap: 14 }}>
          <div className={`drop ${over ? 'over' : ''}`} role="button" tabIndex={0}
               onClick={() => ref.current?.click()} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') ref.current?.click(); }}
               onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
               onDrop={e => { e.preventDefault(); setOver(false); elegir(e.dataTransfer.files?.[0]); }}>
            <b>{file ? file.name : 'Arrastrá el Excel acá o tocá para elegirlo'}</b>
            <span>Dux → Consulta de ventas detallada → Exportar (.xls)</span>
            <input ref={ref} type="file" accept=".xls,.xlsx" hidden onChange={e => elegir(e.target.files?.[0])} />
          </div>
          <p className="mut" style={{ margin: 0, fontSize: 12.5 }}>Podés subir un mes entero o una parte. Si subís de nuevo días que ya estaban, se reemplazan y no se duplican.</p>
          {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" style={{ margin: 0 }}>{error}</p>}
          <div><button type="button" className="btn-primary" disabled={!file || estado === 'subiendo'} onClick={subir}>{estado === 'subiendo' ? 'Importando…' : 'Importar'}</button></div>
        </div>
      )}
    </div>
  );
}

export function KankayHistorial() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/kankay/imports').then(r => setRows(r.data.data)).catch(() => setError('No se pudo cargar el historial')); }, []);
  const cuando = ts => { const d = new Date(ts); return `${d.getDate()} ${MES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  return (
    <div className="kk">
      <h1 className="text-xl font-bold text-stone-900">Historial de Excel de Kankay</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="card sx">
        {!rows ? <p className="mut">Cargando…</p> : !rows.length ? <p className="mut">Todavía no se subió ningún Excel.</p> : (
          <table className="t">
            <thead><tr><th>Subido</th><th>Por</th><th>Archivo</th><th>Período</th><th>Renglones</th><th>Ventas</th><th>Venta con IVA</th><th>Vigente</th></tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.id}><td>{cuando(r.subido_en)}</td><td>{r.subido_por || '–'}</td><td className="w mut">{r.archivo}</td>
                <td>{fecha(r.desde)} → {fecha(r.hasta)}</td><td>{r.renglones}</td><td>{r.ventas}</td><td>{fmt(r.total)}</td>
                <td>{r.vigentes === r.renglones ? 'Sí' : r.vigentes ? `En parte (${r.vigentes})` : <span className="mut">Reemplazado</span>}</td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
