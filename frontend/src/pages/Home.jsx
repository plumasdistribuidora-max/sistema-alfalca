import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';
import { esDueno } from '../utils/roles';
import { colorDeTienda, shortName, fmtARS, fmtDoc } from './red/redUtils';
import { MARCAS } from '../marcas';

// La portada tiene dos versiones: la de los dueños es la del grupo (las marcas con sus
// ventas, el año y lo que necesita atención); la del Encargado General no muestra ventas,
// solo los turnos y las tareas del día.

const DIAS  = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const NUNITO = { fontFamily: 'Nunito, sans-serif' };

function hoyStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
function sumarDias(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const f = new Date(y, m - 1, d + n);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}
function fechaLarga(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const f = new Date(y, m - 1, d);
  return `${DIAS[f.getDay()]} ${d} de ${MESES[m - 1]}`;
}
function fechaCorta(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MESES[m - 1].slice(0, 3)}`;
}
function horaDe(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function variacion(actual, anterior) {
  if (!anterior) return null;
  return Math.round((actual - anterior) / anterior * 100);
}
const capital = s => s.charAt(0).toUpperCase() + s.slice(1);
// "Ayer · 10 oct", "Hoy · 11 oct" o solo la fecha si es más vieja.
function etiquetaDia(iso, hoy) {
  if (iso === hoy) return `Hoy · ${fechaCorta(iso)}`;
  if (iso === sumarDias(hoy, -1)) return `Ayer · ${fechaCorta(iso)}`;
  return fechaCorta(iso);
}

function Var({ v }) {
  if (v === null || v === undefined) return null;
  const pos = v >= 0;
  return (
    <span className={`font-semibold ${pos ? 'text-emerald-700' : 'text-red-600'}`}>
      {pos ? '▲' : '▼'} {Math.abs(v)} %
    </span>
  );
}

function Saludo({ hoy, nombre }) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-ahg-text/50">Alfalca · Inicio</p>
        <h1 className="text-2xl font-bold text-ahg-text mt-0.5" style={NUNITO}>
          Hola{nombre ? `, ${nombre}` : ''}
        </h1>
      </div>
      <p className="text-sm text-ahg-text/50 capitalize">{fechaLarga(hoy)}</p>
    </div>
  );
}

// Turnos de hoy por local: cuántos llegaron de los esperados y a qué hora el último.
function turnosDelDia(dia) {
  return (dia?.locales || [])
    .filter(l => l.esperados > 0)
    .map(l => {
      const recibidos = l.slots.filter(s => ['enviado', 'observado', 'aprobado'].includes(s.estado));
      const ultimo = recibidos.map(s => s.reporte?.enviado_at).filter(Boolean).sort().pop();
      return { ...l, completo: l.recibidos >= l.esperados, hora: horaDe(ultimo) };
    });
}

// Lo que la bandeja de tareas tiene para mirar hoy.
function contarTareas(bandeja) {
  const abiertas = (bandeja?.tareas || []).filter(t => t.estado !== 'terminada');
  return {
    nuevas:      abiertas.filter(t => t.estado === 'nueva').length,
    en_curso:    abiertas.filter(t => t.estado === 'en_curso').length,
    vencidas:    abiertas.filter(t => t.dias_vencida > 0).length,
    por_aprobar: abiertas.filter(t => t.estado === 'por_aprobar').length + (bandeja?.gastos_pendientes?.length || 0),
  };
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

export default function Home() {
  const { user } = useAuth();
  const hoy = hoyStr();
  const [dia, setDia]         = useState(undefined);   // undefined = cargando, null = sin datos
  const [bandeja, setBandeja] = useState(undefined);

  useEffect(() => {
    api.get('/reportes/dia', { params: { fecha: hoy } })
      .then(r => setDia(r.data.data))
      .catch(() => setDia(null));
    api.get('/tareas')
      .then(r => setBandeja(r.data.data))
      .catch(() => setBandeja(null));
  }, [hoy]);

  const nombre = (user?.nombre || '').split(' ')[0];
  const comun = { hoy, nombre, dia, bandeja };
  return esDueno(user) ? <PortadaGrupo {...comun} /> : <PortadaEncargado {...comun} />;
}

// ───────────────────────────────────────────────────────────── Dueños

function PortadaGrupo({ hoy, nombre, dia, bandeja }) {
  const [ventas, setVentas] = useState(undefined);
  const [kankay, setKankay] = useState(undefined);

  useEffect(() => {
    api.get('/red/inicio')
      .then(r => setVentas(r.data.data))
      .catch(() => setVentas(null));
    api.get('/kankay/resumen')
      .then(r => setKankay(r.data.data))
      .catch(() => setKankay(null));
  }, []);

  const turnos = turnosDelDia(dia);
  const faltan = dia ? dia.totales.esperados - dia.totales.recibidos : 0;
  const tareas = contarTareas(bandeja);

  // El mes del grupo: Entre Dos hasta su último día cargado, Kankay hasta el suyo.
  const edMes = ventas?.mes?.facturacion || 0;
  const kkMes = kankay?.hasta?.slice(0, 7) === ventas?.fecha?.slice(0, 7) ? (kankay?.mes || 0) : 0;
  const totalMes = edMes + kkMes;
  const mesNombre = ventas ? MESES[Number(ventas.fecha.slice(5, 7)) - 1] : '';

  const atencion = [];
  if (dia && faltan > 0) {
    const nombres = turnos.filter(l => !l.completo).map(l => `${shortName(l.nombre)} (${l.esperados - l.recibidos})`);
    atencion.push({ tono: 'rojo', texto: `${plural(faltan, 'turno sin reporte', 'turnos sin reporte')}: ${nombres.join(', ')}`, marca: 'Entre Dos', to: '/reportes', cta: 'Ir a reportes' });
  }
  if (tareas.por_aprobar > 0) atencion.push({ tono: 'ambar', texto: `${plural(tareas.por_aprobar, 'cierre o gasto espera', 'cierres o gastos esperan')} la aprobación de un dueño`, marca: 'Entre Dos', to: '/tareas', cta: 'Tareas' });
  if (tareas.vencidas > 0) atencion.push({ tono: 'ambar', texto: `${plural(tareas.vencidas, 'tarea vencida', 'tareas vencidas')} del equipo`, marca: 'Entre Dos', to: '/tareas', cta: 'Tareas' });
  if (kankay?.eerr_pendiente) {
    const [, m] = kankay.eerr_pendiente.split('-').map(Number);
    atencion.push({ tono: 'ambar', texto: `Estado de resultados de ${MESES[m - 1]} sin terminar`, marca: 'Kankay', to: '/marcas/kankay', cta: 'Kankay' });
  }
  if (kankay?.hasta && kankay.hasta < sumarDias(hoy, -7)) {
    atencion.push({ tono: 'ambar', texto: `Las ventas están cargadas hasta el ${fechaCorta(kankay.hasta)}: falta subir el Excel de Dux`, marca: 'Kankay', to: '/marcas/kankay/importar', cta: 'Importar' });
  }

  const ed = MARCAS.find(m => m.slug === 'entre-dos');
  const kk = MARCAS.find(m => m.slug === 'kankay');
  const otras = MARCAS.filter(m => m.slug !== 'entre-dos' && m.slug !== 'kankay');
  const t = ventas?.total;

  return (
    <div className="space-y-5">
      <Saludo hoy={hoy} nombre={nombre} />

      {/* ── El grupo en el mes ────────────────────────────────────────────── */}
      <section className="rounded-2xl bg-ahg-primary text-white px-6 py-5 grid grid-cols-1 lg:grid-cols-2 gap-5 items-end">
        <div>
          <p className="text-xs text-white/65">El grupo en {mesNombre || 'el mes'}</p>
          <p className="text-4xl font-extrabold tracking-tight mt-1" style={NUNITO}>
            {ventas === undefined || kankay === undefined ? '…' : fmtARS(totalMes)}
          </p>
          <p className="text-[13px] text-white/65 mt-1">Ventas con IVA de las marcas que ya venden</p>
        </div>
        {totalMes > 0 && (
          <div>
            <div className="flex h-2.5 rounded-full overflow-hidden bg-white/20">
              <i className="block h-full" style={{ width: `${edMes / totalMes * 100}%`, background: '#f1efe9' }} />
              <i className="block h-full" style={{ width: `${kkMes / totalMes * 100}%`, background: '#a9abae' }} />
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2.5 text-xs text-white/80">
              <Ley color="#f1efe9">Entre Dos · {Math.round(edMes / totalMes * 100)} %</Ley>
              <Ley color="#a9abae">Kankay · {Math.round(kkMes / totalMes * 100)} %</Ley>
              {otras.map(m => <Ley key={m.slug} color="rgba(255,255,255,.25)">{m.nombre} · próximamente</Ley>)}
            </div>
          </div>
        )}
      </section>

      {/* ── Una tarjeta por marca ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TarjetaMarca m={ed}>
          <Datos
            a={{ l: ventas ? etiquetaDia(ventas.fecha, hoy) : 'Último día', v: ventas === undefined ? '…' : ventas ? fmtARS(t.facturacion) : '—',
                 c: ventas?.parcial ? 'Día a medio cargar' : t?.facturacion_ant ? <><Var v={variacion(t.facturacion, t.facturacion_ant)} /> vs día anterior</> : '' }}
            b={{ l: ventas ? `${capital(mesNombre)} · 1 al ${Number(ventas.fecha.slice(8))}` : 'El mes', v: ventas ? fmtARS(edMes) : '…',
                 c: ventas?.mes?.facturacion_aa ? <><Var v={variacion(edMes, ventas.mes.facturacion_aa)} /> vs {mesNombre.slice(0, 3)} {Number(ventas.fecha.slice(0, 4)) - 1}</> : '' }}
          />
          <Estado tono={dia && faltan === 0 ? 'verde' : 'ambar'}>
            {dia === undefined ? 'Cargando los turnos…' : dia ? `Hoy: ${dia.totales.recibidos} de ${dia.totales.esperados} reportes de turno` : 'No se pudo cargar el día'}
          </Estado>
          <Pie izq={ventas ? `${fmtDoc(t.docenas)} docenas · ${t.tickets.toLocaleString('es-AR')} tickets` : ''} />
        </TarjetaMarca>

        <TarjetaMarca m={kk}>
          {kankay ? <>
            <Datos
              a={{ l: etiquetaDia(sumarDias(hoy, -1), hoy), v: fmtARS(kankay.ayer),
                   c: kankay.hoy > 0 ? `hoy ya ${fmtARS(kankay.hoy)}` : 'hoy todavía sin ventas' }}
              b={{ l: `${capital(MESES[Number(kankay.hasta.slice(5, 7)) - 1])} · 1 al ${Number(kankay.hasta.slice(8))}`, v: fmtARS(kankay.mes),
                   c: kankay.mes_ant ? <><Var v={variacion(kankay.mes, kankay.mes_ant)} /> vs mismos días de {MESES[(Number(kankay.hasta.slice(5, 7)) + 10) % 12].slice(0, 3)}</> : '' }}
            />
            <Estado tono={kankay.hasta >= sumarDias(hoy, -2) ? 'verde' : 'ambar'}>Ventas cargadas hasta el {fechaCorta(kankay.hasta)}</Estado>
            <Pie izq={plural(kankay.ventas_mes, 'venta en el mes', 'ventas en el mes')} />
          </> : <Vacio>{kankay === undefined ? 'Cargando…' : 'Sin ventas cargadas'}</Vacio>}
        </TarjetaMarca>

        {otras.map(m => (
          <TarjetaMarca key={m.slug} m={m}>
            <Vacio><span className="text-xs px-3 py-1 rounded-full bg-ahg-bg text-ahg-text/55">Próximamente</span></Vacio>
          </TarjetaMarca>
        ))}
      </div>

      {/* ── El año ──────────────────────────────────────────────────────── */}
      {ventas && <ElAnio ventas={ventas} kankay={kankay} />}

      {/* ── Necesita atención ────────────────────────────────────────────── */}
      <section className="card px-5 py-4">
        <p className="font-bold text-ahg-text mb-1" style={NUNITO}>Necesita atención</p>
        {dia === undefined || bandeja === undefined
          ? <p className="text-sm text-ahg-text/40 py-2">Cargando…</p>
          : atencion.length === 0
            ? <p className="text-sm text-ahg-text/50 py-2 flex items-center gap-2"><Punto tono="verde" />Todo al día</p>
            : atencion.map((a, i) => (
              <Link key={i} to={a.to} className="flex items-center gap-3 py-2.5 border-t first:border-t-0 border-ahg-accent/40 text-sm hover:bg-ahg-bg/50 -mx-2 px-2 rounded-lg">
                <Punto tono={a.tono} />
                <span className="flex-1 min-w-0 text-ahg-text">{a.texto}</span>
                <span className="text-xs text-ahg-text/50 whitespace-nowrap">{a.marca} · {a.cta} ›</span>
              </Link>
            ))}
      </section>
    </div>
  );
}

// El año del grupo: lo vendido en el año contra el mismo período del año pasado, y mes a mes.
// En 2025 solo vendía Entre Dos; Kankay arrancó en agosto de 2026.
function ElAnio({ ventas, kankay }) {
  const anio = Number(ventas.fecha.slice(0, 4));
  const mesHoy = Number(ventas.fecha.slice(5, 7));
  const ed  = Array(12).fill(0), ant = Array(12).fill(0);
  let antMismoPeriodo = 0;
  for (const r of ventas.anio || []) {
    if (r.anio === anio) ed[r.mes - 1] = r.facturacion;
    else {
      ant[r.mes - 1] = r.facturacion;
      if (r.mes < mesHoy) antMismoPeriodo += r.facturacion;
      if (r.mes === mesHoy) antMismoPeriodo += r.hasta_dia;
    }
  }
  const kk = Array(12).fill(0);
  for (const r of kankay?.meses || []) if (Number(r.periodo.slice(0, 4)) === anio) kk[Number(r.periodo.slice(5)) - 1] = r.total;
  const total = ed.reduce((a, v) => a + v, 0) + kk.reduce((a, v) => a + v, 0);
  const max = Math.max(...ed.map((v, i) => v + kk[i]), ...ant, 1);

  return (
    <section className="card px-5 py-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-ahg-text/55">El grupo en {anio} · hasta el {fechaCorta(ventas.fecha)}</p>
          <p className="text-3xl font-extrabold text-ahg-text mt-0.5" style={NUNITO}>{fmtARS(total)}</p>
          <p className="text-xs text-ahg-text/55 mt-0.5">
            <Var v={variacion(total, antMismoPeriodo)} /> vs el mismo período de {anio - 1} ({fmtARS(antMismoPeriodo)}, solo Entre Dos)
          </p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ahg-text/60">
          <Ley color="#45484c">Entre Dos</Ley>
          <Ley color="#a9abae">Kankay</Ley>
          <span className="inline-flex items-center gap-1.5"><b className="inline-block w-3 border-t-2 border-dashed border-ahg-text/40" />{anio - 1}</span>
        </div>
      </div>
      <div className="grid grid-cols-12 gap-1.5 sm:gap-2.5 mt-4 items-end h-36">
        {MESES.map((m, i) => {
          const tot = ed[i] + kk[i];
          return (
            <div key={m} className="relative h-full flex flex-col justify-end group" title={`${capital(m)}: ${fmtARS(tot)}${ant[i] ? ` · ${anio - 1}: ${fmtARS(ant[i])}` : ''}`}>
              {ant[i] > 0 && <div className="absolute inset-x-0 border-t-2 border-dashed border-ahg-text/35" style={{ bottom: `${ant[i] / max * 100}%` }} />}
              {kk[i] > 0 && <div className="rounded-t-[3px]" style={{ height: `${kk[i] / max * 100}%`, background: '#a9abae' }} />}
              {ed[i] > 0 && <div className={kk[i] > 0 ? '' : 'rounded-t-[3px]'} style={{ height: `${ed[i] / max * 100}%`, background: '#45484c', opacity: i + 1 === mesHoy ? 0.75 : 1 }} />}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-12 gap-1.5 sm:gap-2.5 mt-1.5">
        {MESES.map((m, i) => <span key={m} className={`text-[11px] text-center ${i + 1 === mesHoy ? 'text-ahg-text font-semibold' : 'text-ahg-text/45'}`}>{m.slice(0, 3)}</span>)}
      </div>
      <p className="text-[11px] text-ahg-text/45 mt-2">{capital(MESES[mesHoy - 1])} va hasta el {fechaCorta(ventas.fecha)}: la barra está a medio camino.</p>
    </section>
  );
}

function Ley({ color, children }) {
  return <span className="inline-flex items-center gap-1.5"><b className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: color }} />{children}</span>;
}

function TarjetaMarca({ m, children }) {
  const contenido = (
    <>
      <div className="h-28 rounded-xl flex items-center justify-center overflow-hidden" style={{ background: m.fondo }}>
        <img
          src={m.logo} alt={m.nombre}
          className="w-auto max-w-[80%] object-contain mix-blend-screen transition-transform duration-500 ease-out motion-safe:group-hover:scale-110 motion-safe:group-hover:-rotate-1"
          style={{ height: m.alto || 84 }}
        />
      </div>
      <div className="flex items-baseline justify-between gap-2 px-1.5">
        <p className="text-lg font-bold text-ahg-text" style={NUNITO}>{m.nombre}</p>
        <p className="text-xs text-ahg-text/50">{m.rubro}</p>
      </div>
      {children}
    </>
  );
  const clase = 'card p-3.5 flex flex-col gap-3.5';
  return m.proximamente
    ? <div className={clase}>{contenido}</div>
    : <Link to={m.to} className={`${clase} group transition-all duration-300 ease-out motion-safe:hover:-translate-y-1 hover:shadow-md`}>{contenido}</Link>;
}

function Datos({ a, b }) {
  return (
    <div className="grid grid-cols-2 border-t border-ahg-accent/40 mx-1.5">
      {[a, b].map((d, i) => (
        <div key={i} className={`pt-3 min-w-0 ${i ? 'pl-3.5 border-l border-ahg-accent/40' : ''}`}>
          <p className="text-[11.5px] text-ahg-text/55">{d.l}</p>
          <p className="text-xl font-extrabold text-ahg-text mt-0.5 tabular-nums" style={NUNITO}>{d.v}</p>
          <p className="text-[11.5px] text-ahg-text/55 min-h-[17px]">{d.c}</p>
        </div>
      ))}
    </div>
  );
}

function Punto({ tono }) {
  const c = { verde: 'bg-emerald-700', ambar: 'bg-[#b06f2d]', rojo: 'bg-red-700' }[tono];
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c}`} />;
}

function Estado({ tono, children }) {
  return <div className="mx-1.5 px-3 py-2 rounded-lg bg-ahg-bg text-[12.5px] text-ahg-text flex items-center gap-2"><Punto tono={tono} />{children}</div>;
}

function Pie({ izq }) {
  return (
    <div className="flex justify-between gap-2 px-1.5 pb-1 text-[13px] font-semibold text-ahg-primary">
      <span className="text-ahg-text/55 font-medium">{izq}</span><span>Ver dashboard →</span>
    </div>
  );
}

function Vacio({ children }) {
  return <div className="flex-1 flex items-center justify-center border-t border-ahg-accent/40 mx-1.5 min-h-[120px] text-sm text-ahg-text/45">{children}</div>;
}

// ───────────────────────────────────────────────────────────── Encargado General

function PortadaEncargado({ hoy, nombre, dia, bandeja }) {
  const turnos = turnosDelDia(dia);
  const faltan = dia ? dia.totales.esperados - dia.totales.recibidos : 0;
  const faltanNombres = turnos.filter(l => !l.completo).map(l => shortName(l.nombre));
  const tareas = contarTareas(bandeja);
  const cargandoT = bandeja === undefined;

  return (
    <div className="space-y-5">
      <Saludo hoy={hoy} nombre={nombre} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Cuadro
          label="Reportes de hoy"
          value={dia === undefined ? '…' : dia ? `${dia.totales.recibidos} de ${dia.totales.esperados}` : '—'}
          sub={dia ? (faltan > 0 ? `Falta${faltan > 1 ? 'n' : ''} ${faltanNombres.join(', ')}` : 'Están todos') : ''}
          color={dia && faltan > 0 ? '#b06f2d' : '#00633a'}
        />
        <Cuadro
          label="Tareas para tomar"
          value={cargandoT ? '…' : bandeja ? tareas.nuevas : '—'}
          sub={bandeja ? `${plural(tareas.en_curso, 'en curso', 'en curso')}` : ''}
        />
        <Cuadro
          label="Tareas vencidas"
          value={cargandoT ? '…' : bandeja ? tareas.vencidas : '—'}
          sub={bandeja ? (tareas.vencidas ? 'Pasaron el plazo que pusiste' : 'Ninguna') : ''}
          color={tareas.vencidas ? '#b91c1c' : undefined}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="card p-4 lg:col-span-3">
          <p className="font-bold text-ahg-text mb-1" style={NUNITO}>Turnos de hoy</p>
          {dia === undefined && <p className="text-sm text-ahg-text/40 py-3">Cargando…</p>}
          {dia === null && <p className="text-sm text-ahg-text/40 py-3">No se pudo cargar el día.</p>}
          {dia && turnos.length === 0 && <p className="text-sm text-ahg-text/40 py-3">Ningún local tiene turnos configurados.</p>}
          {turnos.map(l => (
            <div key={l.local_id} className="flex items-center gap-3 py-2 border-b border-ahg-accent/30 last:border-0 text-sm">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colorDeTienda(l.nombre) }} />
              <span className="flex-1 font-medium text-ahg-text">{shortName(l.nombre)}</span>
              <span className="text-xs text-ahg-text/50">{l.recibidos} de {l.esperados}</span>
              <span className="flex items-center gap-1.5 text-xs text-ahg-text/60 w-28 justify-end">
                <span className={`w-2 h-2 rounded-full ${l.completo ? 'bg-emerald-600' : l.recibidos > 0 ? 'bg-amber-500' : 'bg-ahg-accent'}`} />
                {l.completo ? `Completo ${l.hora}` : l.recibidos > 0 ? `Parcial ${l.hora}` : 'Pendiente'}
              </span>
            </div>
          ))}
        </div>

        <div className="lg:col-span-2 flex flex-col gap-3">
          <Acceso to="/reportes"    titulo="Ir a Reportes" sub={faltan > 0 ? `Reclamar ${faltan === 1 ? 'el turno que falta' : `los ${faltan} turnos que faltan`}` : 'Revisar y cerrar el día'} oscuro />
          <Acceso to="/tareas"      titulo="Tareas"        sub={tareas.nuevas ? `${plural(tareas.nuevas, 'tarea espera', 'tareas esperan')} que la tomes` : 'La bandeja del equipo'} />
          <Acceso to="/proveedores" titulo="Proveedores"   sub="Pedido de stock y facturas" />
        </div>
      </div>
    </div>
  );
}

function Cuadro({ label, value, sub, color }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-ahg-text/60">{label}</p>
      <p className="text-2xl font-bold mt-0.5" style={{ ...NUNITO, color: color || '#1f2022' }}>{value}</p>
      <p className="text-xs text-ahg-text/50 mt-0.5 min-h-[16px]">{sub}</p>
    </div>
  );
}

function Acceso({ to, titulo, sub, oscuro }) {
  const base = 'rounded-2xl px-5 py-4 flex flex-col gap-0.5 transition-colors';
  return oscuro ? (
    <Link to={to} className={`${base} bg-ahg-primary text-white hover:bg-ahg-secondary`}>
      <span className="font-bold" style={NUNITO}>{titulo}</span>
      <span className="text-xs text-white/70">{sub}</span>
    </Link>
  ) : (
    <Link to={to} className={`${base} card hover:bg-violet-50`}>
      <span className="font-bold text-ahg-text" style={NUNITO}>{titulo}</span>
      <span className="text-xs text-ahg-text/50">{sub}</span>
    </Link>
  );
}
