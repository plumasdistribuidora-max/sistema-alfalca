import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../../api';
import { estadoAvisos } from '../../../utils/avisos';
import { useAuth } from '../../../contexts/AuthContext';
import { esDueno } from '../../../utils/roles';
import { MARCAS } from '../../../marcas';
import { Proximamente } from '../../MarcaProximamente';
import ElMes from './ElMes';
import Recupero from './Recupero';
import { MesAMes, Productos, Vendedores, DiasHoras, Eerr } from './Secciones';
import { fmt, pc, mesN, cap, MES, enCurso, diaHasta } from './kankayUtils';
import './kankay.css';

const TABS = [
  { id: 'mes',  label: 'El mes' },
  { id: 'mam',  label: 'Mes a mes' },
  { id: 'prod', label: 'Productos' },
  { id: 'vend', label: 'Vendedores', wip: true },
  { id: 'dh',   label: 'Días y horas' },
  { id: 'eerr', label: 'Estado de resultados' },
  { id: 'rec',  label: 'Recupero' },
];

function actualizado(ts) {
  const d = new Date(ts);
  return `${d.getDate()} ${MES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Kankay es solo del dueño: el encargado general ve la marca como "próximamente".
export default function KankayRuta() {
  const { user } = useAuth();
  if (!esDueno(user)) return <Proximamente marca={{ ...MARCAS.find(m => m.slug === 'kankay'), proximamente: true }} />;
  return <KankayDashboard />;
}

function KankayDashboard() {
  const [D, setD] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('mes');
  const [verAvisos, setVerAvisos] = useState(false);

  const cargar = useCallback(() => {
    api.get('/kankay/datos').then(r => setD(r.data.data)).catch(err => setError(err.response?.data?.error || 'No se pudieron cargar los datos'));
  }, []);
  useEffect(cargar, [cargar]);

  if (error) return <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{error}</p>;
  if (!D) return <div className="space-y-4"><div className="h-36 bg-stone-200 rounded-2xl animate-pulse" /><div className="grid sm:grid-cols-4 gap-3">{[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-stone-200 rounded-2xl animate-pulse" />)}</div></div>;
  if (D.vacio) return (
    <div className="card p-8 text-center space-y-3">
      <p className="font-semibold text-stone-800">Todavía no hay ventas de Kankay cargadas.</p>
      <Link to="/marcas/kankay/importar" className="btn-primary inline-block">Importar el Excel de Dux</Link>
    </div>
  );

  const comPct = D.eerr.comisionPct;
  const onCambioEerr = (eerr, pct) => setD(d => ({ ...d, eerr: eerr ? eerr : { ...d.eerr, comisionPct: pct } }));
  const desde = D.total.desde, hasta = D.total.hasta;

  return (
    <div className="kk -mt-2">
      <div className="hdr">
        <div className="t">
          <div><h1>KANKAY</h1><div className="k">{hasta.slice(0, 4)} · 1 local · Mendoza</div></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="bell" aria-expanded={verAvisos} onClick={() => setVerAvisos(v => !v)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
              Avisos de Kankay <span className="on" />
            </button>
            {D.ultimoImport && <span className="badge"><i />Actualizado {actualizado(D.ultimoImport.subido_en)}</span>}
          </div>
        </div>
        <div className="s">{Number(desde.slice(8))} {MES[Number(desde.slice(5, 7)) - 1].slice(0, 3)} – {Number(hasta.slice(8))} {MES[Number(hasta.slice(5, 7)) - 1].slice(0, 3)} {hasta.slice(0, 4)} · sartenes, ollas y accesorios</div>
        <div className="tabs" role="tablist">
          {TABS.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}{t.wip && <span className="wip">en mejora</span>}</button>)}
        </div>
      </div>

      {verAvisos && <Avisos D={D} />}

      {tab === 'mes'  && <ElMes D={D} eerr={D.eerr} comPct={comPct} />}
      {tab === 'mam'  && <MesAMes D={D} />}
      {tab === 'prod' && <Productos D={D} />}
      {tab === 'vend' && <Vendedores D={D} />}
      {tab === 'dh'   && <DiasHoras D={D} />}
      {tab === 'eerr' && <Eerr D={D} eerr={D.eerr} comPct={comPct} onCambio={onCambioEerr} />}
      {tab === 'rec'  && <Recupero D={D} eerr={D.eerr} comPct={comPct} />}
    </div>
  );
}

// Qué avisos de Kankay recibe este dueño, con un ejemplo de cada uno armado con los datos reales.
function Avisos({ D }) {
  const [temas, setTemas] = useState(null);
  const [aparato, setAparato] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get('/kankay/avisos').then(r => setTemas(r.data.data)).catch(() => setError('No se pudieron cargar los avisos'));
    estadoAvisos().then(setAparato).catch(() => setAparato('no_soporta'));
  }, []);

  async function cambiar(tema, activo) {
    setTemas(ts => ts.map(t => t.tema === tema ? { ...t, activo } : t));
    try { const r = await api.put(`/kankay/avisos/${tema}`, { activo }); setTemas(r.data.data); }
    catch { setError('No se pudo guardar'); }
  }

  const meses = Object.keys(D.meses).sort(), u = meses.at(-1), M = D.meses[u], prevK = meses.at(-2), P = prevK && D.meses[prevK];
  const curso = enCurso(D), dia = curso ? diaHasta(D, curso) : null;
  const cmpP = P && (curso ? P.hasta1_[dia] : P);
  const ej = {
    kankay_ventas: `Se cargaron las ventas hasta el ${Number(M.hasta.slice(8))} de ${mesN(u)}: ${fmt(M.tot)} con IVA en ${M.ventas} ventas.${cmpP ? ` ${cap(mesN(u))} va ${M.tot >= cmpP.tot ? '▲' : '▼'} ${pc(Math.abs(M.tot / cmpP.tot - 1))} contra ${curso ? 'los mismos días del mes anterior' : mesN(prevK)}.` : ''}`,
    kankay_eerr: `Martín terminó el estado de resultados de ${mesN(meses[0])}. Resultado operativo y resultado del mes, con el porcentaje de la venta.`,
    kankay_equilibrio: `${cap(mesN(u))} pasó el punto de equilibrio: lleva más venta de la que hace falta para cubrir los gastos.`,
    kankay_cierre: P ? `${cap(mesN(prevK))} cerró en ${fmt(P.tot)} con IVA. Margen bruto ${pc((P.neto - P.cmv) / P.neto)}.` : 'El día 1, el resumen del mes que terminó.',
    kankay_recordatorio: 'Hace 7 días que no se sube el Excel de ventas de Kankay.',
  };

  return (
    <div className="card">
      <div className="avisos">
        <div>
          <h3>Avisos de Kankay en tu celular</h3>
          <p className="sub">Cada dueño elige qué quiere recibir. Llegan como los avisos de tareas.</p>
          {aparato && aparato !== 'activo' && (
            <p className="wipbox" style={{ marginBottom: 8 }}>
              <b>En este aparato los avisos no están activados.</b> {aparato === 'falta_instalar'
                ? 'En iPhone hay que agregar el sistema a la pantalla de inicio y abrirlo desde ese ícono.'
                : aparato === 'bloqueado' ? 'El navegador los tiene bloqueados: hay que permitirlos en la configuración del sitio.'
                : 'Activalos con el botón de avisos de arriba del sistema.'}
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {temas?.map(t => (
            <div className="tg" key={t.tema}>
              <b>{t.titulo}</b>
              <button type="button" className="sw2" role="switch" aria-checked={t.activo} aria-label={t.titulo} onClick={() => cambiar(t.tema, !t.activo)} />
              <p>{t.detalle}</p>
            </div>
          ))}
        </div>
        <div className="phone" aria-label="Así llegan">
          <div className="clock">18:42</div>
          {temas?.map(t => (
            <div key={t.tema} className={`ntf ${t.activo ? '' : 'off'}`}>
              <div className="nh"><b>alfalca · Kankay</b><span>ejemplo</span></div>
              <b>{t.titulo}</b><br />{ej[t.tema]}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
