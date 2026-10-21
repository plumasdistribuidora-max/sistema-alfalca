import { useEffect, useRef, useState } from 'react';
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
  const [senzen, setSenzen] = useState(undefined);

  useEffect(() => {
    api.get('/senzen/resumen')
      .then(r => setSenzen(r.data.data))
      .catch(() => setSenzen(null));
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
  const szMes = senzen?.mes || 0;
  const totalMes = edMes + kkMes + szMes;
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
  const sz = MARCAS.find(m => m.slug === 'senzen');
  const otras = MARCAS.filter(m => !['entre-dos', 'kankay', 'senzen'].includes(m.slug));
  const t = ventas?.total;

  return (
    <div className="space-y-5">
      <Saludo hoy={hoy} nombre={nombre} />

      {/* ── El grupo en el mes ────────────────────────────────────────────── */}
      <section className="rounded-2xl bg-ahg-primary text-white px-6 py-5 grid grid-cols-1 lg:grid-cols-2 gap-5 items-end">
        <div>
          <p className="text-xs text-white/65">El grupo en {mesNombre || 'el mes'}</p>
          <p className="text-4xl font-extrabold tracking-tight mt-1" style={NUNITO}>
            {ventas === undefined || kankay === undefined || senzen === undefined ? '…' : fmtARS(totalMes)}
          </p>
          <p className="text-[13px] text-white/65 mt-1">Ventas con IVA de las marcas que ya venden</p>
        </div>
        {totalMes > 0 && (
          <div>
            <div className="flex h-2.5 rounded-full overflow-hidden bg-white/20">
              <i className="block h-full" style={{ width: `${edMes / totalMes * 100}%`, background: '#f1efe9' }} />
              <i className="block h-full" style={{ width: `${kkMes / totalMes * 100}%`, background: '#a9abae' }} />
              <i className="block h-full" style={{ width: `${szMes / totalMes * 100}%`, background: '#5fb8b2' }} />
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2.5 text-xs text-white/80">
              <Ley color="#f1efe9">Entre Dos · {Math.round(edMes / totalMes * 100)} %</Ley>
              <Ley color="#a9abae">Kankay · {Math.round(kkMes / totalMes * 100)} %</Ley>
              {szMes > 0 && <Ley color="#5fb8b2">Senzen · {Math.round(szMes / totalMes * 100)} %</Ley>}
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

        {/* Senzen es solo de los dueños: el encargado general la ve como "próximamente". */}
        <TarjetaMarca m={senzen === null ? { ...sz, proximamente: true } : sz}>
          {senzen ? <>
            <Datos
              a={{ l: `${capital(MESES[Number(hoy.slice(5, 7)) - 1])} en Dux`, v: fmtARS(senzen.mes),
                   c: senzen.mes_ant ? `${capital(MESES[(Number(hoy.slice(5, 7)) + 10) % 12])} entero: ${fmtARS(senzen.mes_ant)}` : plural(senzen.clientes, 'comercio', 'comercios') }}
              b={{ l: 'Pepa esta semana', v: plural(senzen.contactos, 'contacto', 'contactos'),
                   c: senzen.tareas ? `${plural(senzen.tareas, 'comercio pendiente', 'comercios pendientes')} hoy` : 'nada pendiente hoy' }}
            />
            <Estado tono={senzen.sync ? 'verde' : 'ambar'}>{senzen.sync ? 'Se lee sola de Dux de Plumas' : 'Todavía no se leyó Dux'}</Estado>
          </> : <Vacio>{senzen === undefined ? 'Cargando…' : <span className="text-xs px-3 py-1 rounded-full bg-ahg-bg text-ahg-text/55">Próximamente</span>}</Vacio>}
        </TarjetaMarca>

        {otras.map(m => (
          <TarjetaMarca key={m.slug} m={m}>
            <Vacio><span className="text-xs px-3 py-1 rounded-full bg-ahg-bg text-ahg-text/55">Próximamente</span></Vacio>
          </TarjetaMarca>
        ))}
      </div>

      {/* ── El año ──────────────────────────────────────────────────────── */}
      {ventas && <CierreDelAnio ventas={ventas} kankay={kankay} />}

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

// ¿Cómo cerramos el año? Una sola barra que se entiende sin explicación: lo vendido hasta
// hoy, lo que falta al ritmo actual, la meta (lo de 2025 más la inflación cargada en el
// dashboard) y todo 2025. Abajo, cuánto hay que vender por mes para llegar.
// "Si seguimos así": el mes en curso se estira a fin de mes con su promedio diario; los
// meses que faltan son los mismos de 2025 al ritmo de crecimiento de los últimos 3 meses
// cerrados. Kankay (no existía en 2025) suma lo que vendió en promedio sus meses cerrados.
function CierreDelAnio({ ventas, kankay }) {
  const [vista, setVista] = useState('grupo');
  const [moneda, setMoneda] = useState('ars');
  const anio   = Number(ventas.fecha.slice(0, 4));
  const mesHoy = Number(ventas.fecha.slice(5, 7));
  const diaHoy = Number(ventas.fecha.slice(8, 10));
  const diasMes = new Date(anio, mesHoy, 0).getDate();

  const ed = Array(12).fill(0), ant = Array(12).fill(0);
  for (const r of ventas.anio || []) {
    if (r.anio === anio) ed[r.mes - 1] = r.facturacion;
    else ant[r.mes - 1] = r.facturacion;
  }
  const kk = Array(12).fill(0);
  for (const r of kankay?.meses || []) if (Number(r.periodo.slice(0, 4)) === anio) kk[Number(r.periodo.slice(5)) - 1] = r.total;
  const conKankay = vista === 'grupo';

  // Ritmo de Entre Dos: cuánto más vendió que en 2025 en los últimos 3 meses cerrados.
  const cerrados = [mesHoy - 4, mesHoy - 3, mesHoy - 2].filter(i => i >= 0 && ant[i] > 0);
  const ritmo = cerrados.length ? cerrados.reduce((a, i) => a + ed[i] / ant[i], 0) / cerrados.length : 1;
  const restoMesEd = ed[mesHoy - 1] / diaHoy * diasMes - ed[mesHoy - 1];
  const futurosEd = ant.slice(mesHoy).reduce((a, v) => a + v * ritmo, 0);

  // Kankay: su mes en curso se estira con su propio último día cargado.
  const kkCerrados = kk.slice(0, mesHoy - 1).filter(v => v > 0);
  const kkProm = kkCerrados.length ? kkCerrados.reduce((a, v) => a + v, 0) / kkCerrados.length : 0;
  const kkDia = kankay?.hasta?.slice(0, 7) === ventas.fecha.slice(0, 7) ? Number(kankay.hasta.slice(8, 10)) : 0;
  const restoMesKk = kkDia ? kk[mesHoy - 1] / kkDia * diasMes - kk[mesHoy - 1] : kkProm;
  const futurosKk = kkProm * (12 - mesHoy);

  const vendidoArs = ed.reduce((a, v) => a + v, 0) + (conKankay ? kk.reduce((a, v) => a + v, 0) : 0);
  const cierreArs  = vendidoArs + restoMesEd + futurosEd + (conKankay ? restoMesKk + futurosKk : 0);
  const total25Ars = ant.reduce((a, v) => a + v, 0);
  const ipc        = ventas.inflacion?.valor;

  // En dólares (oficial BNA): cada mes al promedio de ese mes, lo que falta del año al dólar
  // de hoy. La meta en dólares es vender al menos los mismos dólares que el año pasado.
  const dolar = ventas.dolar;
  const usd   = moneda === 'usd' && dolar?.hoy;
  const cot   = (a, i) => dolar?.promedio?.[`${a}-${String(i + 1).padStart(2, '0')}`] ?? dolar?.hoy?.venta;
  const vendido = usd ? ed.reduce((a, v, i) => a + (v + (conKankay ? kk[i] : 0)) / cot(anio, i), 0) : vendidoArs;
  const cierre  = usd ? vendido + (cierreArs - vendidoArs) / dolar.hoy.venta : cierreArs;
  const total25 = usd ? ant.reduce((a, v, i) => a + v / cot(anio - 1, i), 0) : total25Ars;
  const meta    = usd ? total25 : ipc != null ? total25 * (1 + ipc / 100) : null;
  const fmt     = v => usd ? `US$ ${Math.round(v).toLocaleString('es-AR')}` : fmtARS(v);
  const nombreMeta = usd ? `Meta: los mismos dólares que ${anio - 1}` : 'Meta: no perder contra la inflación';
  const falta   = meta != null ? meta - cierre : null;
  const mesesQueFaltan = (diasMes - diaHoy) / diasMes + (12 - mesHoy);
  const necesita = meta != null ? (meta - vendido) / mesesQueFaltan : null;
  // Cuánto es la diferencia contra la meta, en porcentaje de la meta.
  const pctMeta = v => `${(v / meta * 100).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
  // Lo que venimos vendiendo: el promedio real por mes de lo vendido en el año, no la proyección.
  const venimos  = vendido / (mesHoy - 1 + diaHoy / diasMes);

  const max = Math.max(cierre, meta || 0, total25) * 1.04;
  const pct = v => Math.min(100, v / max * 100);
  // Los días que toma en cuenta: del 1 de enero al último día con ventas cargadas.
  const diaDelAnio = Math.round((Date.UTC(anio, mesHoy - 1, diaHoy) - Date.UTC(anio, 0, 1)) / 86400000) + 1;
  const diasQueFaltan = (anio % 4 === 0 ? 366 : 365) - diaDelAnio;

  // Al pasar el mouse la venta se carga desde cero (el monto va contando) y después se
  // completa lo que falta del año. Quieta, la barra queda completa (fase 2).
  const [fase, setFase] = useState(2);
  const corriendo = useRef(false);
  function animar() {
    if (corriendo.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    corriendo.current = true;
    const t0 = performance.now();
    const paso = ahora => {
      const ms = ahora - t0;   // 1,4 s carga lo vendido, 0,7 s lo que falta del año
      const f = ms < 1400 ? ms / 1400 : Math.min(2, 1 + (ms - 1400) / 700);
      setFase(f);
      if (f < 2) requestAnimationFrame(paso); else setTimeout(() => { corriendo.current = false; }, 500);
    };
    requestAnimationFrame(paso);
  }
  const suave = x => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
  const vendVista = vendido * suave(fase);
  const proyVista = fase < 1 ? vendVista : vendido + (cierre - vendido) * suave(fase - 1);
  const terminado = fase >= 2;

  return (
    <section className="card px-5 py-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-ahg-text/55">¿Cómo cerramos {anio}?</p>
        <div className="flex gap-2 flex-wrap">
          {dolar?.hoy && (
            <div className="inline-flex rounded-lg border border-ahg-accent/60 overflow-hidden text-xs">
              {[['ars', 'Pesos'], ['usd', 'Dólares']].map(([v, l]) => (
                <button key={v} onClick={() => setMoneda(v)}
                  className={`px-3 py-1.5 transition-colors ${moneda === v ? 'bg-ahg-primary text-white' : 'text-ahg-text/60 hover:bg-ahg-bg'}`}>{l}</button>
              ))}
            </div>
          )}
          <div className="inline-flex rounded-lg border border-ahg-accent/60 overflow-hidden text-xs">
            {[['grupo', 'Todo el grupo'], ['ed', 'Solo Entre Dos']].map(([v, l]) => (
              <button key={v} onClick={() => setVista(v)}
                className={`px-3 py-1.5 transition-colors ${vista === v ? 'bg-ahg-primary text-white' : 'text-ahg-text/60 hover:bg-ahg-bg'}`}>{l}</button>
            ))}
          </div>
        </div>
      </div>
      <p className="text-lg sm:text-xl font-bold text-ahg-text mt-1 leading-snug" style={NUNITO}>
        Si seguimos como venimos, cerramos en {fmt(cierre)}.
        {meta != null && (usd
          ? (falta > 0
            ? <> <span className="text-red-700">Son {fmt(falta)} menos que en {anio - 1} ({pctMeta(falta)})</span>.</>
            : <> <span className="text-green-700">Son {fmt(-falta)} más que en {anio - 1} ({pctMeta(-falta)})</span>.</>)
          : (falta > 0
            ? <> Para no perder contra la inflación necesitamos {fmt(meta)}: <span className="text-red-700">nos faltarían {fmt(falta)} ({pctMeta(falta)})</span>.</>
            : <> <span className="text-green-700">Le ganamos a la inflación por {fmt(-falta)} ({pctMeta(-falta)})</span>.</>))}
      </p>

      {/* La barra no la cruza nada: cada marca es un triangulito en el borde con su texto afuera. */}
      <div className="relative mt-5 sm:mt-14 mb-3 sm:mb-14" onMouseEnter={animar} onClick={animar}>
        <div className="relative h-11 rounded-lg bg-ahg-bg overflow-hidden">
          <div className="absolute inset-y-0 left-0 rounded-lg flex items-center justify-end pr-3"
               style={{ width: `${pct(proyVista)}%`, backgroundImage: 'repeating-linear-gradient(45deg, #9a9c9e 0 6px, #c3c2bd 6px 12px)' }}>
            {terminado && pct(cierre) - pct(vendido) > 12 && (
              <span className="text-[11px] sm:text-xs font-semibold text-ahg-text bg-white/80 rounded px-1.5 py-0.5 whitespace-nowrap">faltan {diasQueFaltan} días</span>
            )}
          </div>
          <div className="absolute inset-y-0 left-0 rounded-lg bg-[#45484c] flex items-center justify-between px-3 text-white text-xs sm:text-sm gap-2 overflow-hidden"
               style={{ width: `${pct(vendVista)}%` }}>
            <span className="truncate text-white/80">1 ene → {fechaCorta(ventas.fecha)} · {diaDelAnio} días</span>
            <b className="whitespace-nowrap font-semibold tabular-nums">{fmt(vendVista)}</b>
          </div>
        </div>
        {meta != null && <Marca x={pct(meta)} arriba titulo={nombreMeta} valor={fmt(meta)} fuerte visible={proyVista >= meta} />}
        {/* En dólares la meta ya es todo el año pasado: no se repite la marca. */}
        {!usd && <Marca x={pct(total25)} titulo={`Todo ${anio - 1}`} valor={fmt(total25)} tenue visible={proyVista >= total25} />}
        <Marca x={pct(cierre)} titulo="Cierre si seguimos así" valor={fmt(cierre)} visible={terminado} />
      </div>
      {/* En el celular no entran los rótulos al lado de cada marca: van en lista. */}
      <ul className="sm:hidden space-y-1 text-xs mb-3 mt-6">
        {meta != null && <li className="flex justify-between gap-3"><span className="font-semibold text-ahg-text">▏{nombreMeta}</span><span className="tabular-nums">{fmt(meta)}</span></li>}
        <li className="flex justify-between gap-3 text-ahg-text/70"><span className="font-semibold">▏Cierre si seguimos así</span><span className="tabular-nums">{fmt(cierre)}</span></li>
        {!usd && <li className="flex justify-between gap-3 text-ahg-text/45"><span className="font-semibold">▏Todo {anio - 1}</span><span className="tabular-nums">{fmt(total25)}</span></li>}
      </ul>

      <p className="rounded-lg bg-ahg-bg px-4 py-3 text-sm text-ahg-text">
        {necesita != null && necesita > venimos
          ? <>Para llegar a la meta hay que vender <b>{fmt(necesita)} por mes</b> de acá a fin de año. Hoy venimos vendiendo <b>{fmt(venimos)}</b> por mes.</>
          : <>Venimos vendiendo <b>{fmt(venimos)}</b> por mes: alcanza con mantenerlo.</>}
      </p>
      {usd ? (
        <p className="text-[11px] text-ahg-text/45 mt-2">
          Dólar oficial BNA: cada mes al promedio de ese mes; lo que falta del año, al de hoy ({fmtARS(dolar.hoy.venta)}). Lo de {anio - 1} es solo Entre Dos: Kankay no existía.
        </p>
      ) : ipc != null && (
        <p className="text-[11px] text-ahg-text/45 mt-2">
          Meta: lo vendido en {anio - 1} más la inflación de {String(ipc).replace('.', ',')} % (dato de {ventas.inflacion.mes ? `${MESES[Number(ventas.inflacion.mes.slice(5, 7)) - 1]} ${ventas.inflacion.mes.slice(0, 4)}` : ''}). Lo de {anio - 1} es solo Entre Dos: Kankay no existía.
        </p>
      )}
    </section>
  );
}

// Una marca de la barra del año: un triangulito en el borde (no cruza la barra) y, en
// computadora, su nombre y su monto afuera. Aparece cuando la carga la alcanza.
function Marca({ x, titulo, valor, arriba, fuerte, tenue, visible = true }) {
  // Cerca de los bordes el texto se alinea hacia adentro para que no se corte.
  const alinear = x > 82 ? '-translate-x-full text-right' : x < 14 ? '' : '-translate-x-1/2 text-center';
  const color = fuerte ? 'text-ahg-text' : tenue ? 'text-ahg-text/45' : 'text-ahg-text/70';
  const tri = fuerte ? '#1f2022' : tenue ? '#b8b6b0' : '#7d8085';
  return (
    <div className="absolute transition-opacity duration-300" style={{ left: `${x}%`, opacity: visible ? 1 : 0,
         top: arriba ? undefined : '100%', bottom: arriba ? '100%' : undefined }}>
      <span className="absolute -translate-x-1/2" style={arriba
        ? { bottom: 2, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: `7px solid ${tri}` }
        : { top: 2, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderBottom: `7px solid ${tri}` }} />
      <div className={`absolute whitespace-nowrap text-xs ${color} ${alinear} hidden sm:block`}
           style={arriba ? { bottom: 12 } : { top: 12 }}>
        <p className="font-semibold">{titulo}</p>
        <p className="tabular-nums">{valor}</p>
      </div>
    </div>
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
