// El motor de las alertas.
//
// El día termina cuando entra el Fudo, no cuando alguien lo cierra. Cada vez que se
// importa un Excel, se repasan los últimos días: para cada local que ya tiene su Fudo
// cargado, se cruza lo que mandó cada turno y todo lo que no está bien nace como tarea.
// Es idempotente: una tarea se identifica por su clave y no nace dos veces aunque el
// Excel se reimporte.

const pool = require('../config/db');
const { armarDia } = require('../routes/consolidado');
const { elegirReporte } = require('../utils/reportes');
const T = require('../utils/tareas');
const avisos = require('./avisos');

const money = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const $ = v => `$ ${money.format(Math.round(v))}`;
const corto = nombre => (nombre || '').replace(' Tienda de Alfajores', '').replace(' Cafetería', '');
const DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const ddmm = f => f.split('-').reverse().slice(0, 2).join('/');
const diaLargo = f => `${DIA[new Date(`${f}T12:00:00`).getDay()]} ${ddmm(f)}`;
const ETIQUETA_PLANTILLA = { tienda: 'Tienda', cafe: 'Café', cocina: 'Cocina', barista: 'Barista' };

function sumarDias(fecha, dias) {
  const d = new Date(`${fecha}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return T.fechaStr(d);
}

// ── ¿Ya está el Fudo de ese día? ─────────────────────────────────────────────
// Un local tiene su día cargado si hay un import de ese local hecho después de ese
// día que lo abarca. La fecha_hasta del import es la del último ticket: un local que
// no abrió el domingo deja el Excel del lunes terminando el sábado, por eso se acepta
// hasta dos días antes.
async function localesCubiertos(fecha) {
  const { rows } = await pool.query(`
    SELECT DISTINCT local_id FROM imports_log
    WHERE tipo = 'ventas' AND status = 'completado'
      AND fecha_desde <= $1::date
      AND fecha_hasta >= $1::date - 2
      AND (created_at AT TIME ZONE 'America/Argentina/Mendoza')::date > $1::date
  `, [fecha]);
  return new Set(rows.map(r => r.local_id));
}

// ── Qué reportes tenían que llegar ───────────────────────────────────────────
// La misma cuenta que la grilla de Reportes, con una diferencia: si el local abrió
// no lo dice una lista de días, lo dice el Fudo. Si hay ventas de ese local ese día,
// se esperaba el reporte; si no hay ninguna, el local no abrió y no se espera nada.
async function slotsDelDia(fecha, abiertos) {
  const plantillas = (await pool.query(
    'SELECT codigo, nombre, area, campos FROM reporte_plantillas WHERE activo = true'
  )).rows;
  const areas = (await pool.query(`
    SELECT DISTINCT local_id_principal AS local_id, area
    FROM empleados WHERE activo = true AND carga_reporte = true
  `)).rows;
  const cargados = (await pool.query(`
    SELECT r.id, r.plantilla_codigo, r.turno, r.estado, r.local_id, r.enviado_at, r.usuario_id,
           u.nombre AS usuario_nombre
    FROM reportes r JOIN usuarios u ON u.id = r.usuario_id
    WHERE r.fecha = $1 AND r.estado <> 'borrador'
  `, [fecha])).rows;

  const slots = [];
  for (const { local_id, area } of areas) {
    if (!abiertos.has(local_id)) continue;
    const p = plantillas.find(x => x.area === area);
    if (!p) continue;
    const turnos = p.campos.find(c => c.codigo === 'turno')?.opciones || ['Único'];
    for (const turno of turnos) {
      const reporte = elegirReporte(
        cargados.filter(r => r.local_id === local_id && r.plantilla_codigo === p.codigo && r.turno === turno)
      );
      slots.push({ local_id, plantilla: p.codigo, plantilla_nombre: p.nombre, turno, reporte });
    }
  }
  return slots;
}

async function crear(t, nuevas) {
  const { rows } = await pool.query(`
    INSERT INTO tareas (tipo, local_id, fecha, clave, titulo, detalle, reporte_id)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
    ON CONFLICT (clave) DO NOTHING
    RETURNING id
  `, [t.tipo, t.local_id || null, t.fecha, t.clave, t.titulo, JSON.stringify(t.detalle || {}), t.reporte_id || null]);
  if (!rows.length) return null;
  await pool.query(
    `INSERT INTO tarea_eventos (tarea_id, tipo, texto) VALUES ($1, 'creada', $2)`,
    [rows[0].id, t.origen || 'El sistema levantó la alerta al entrar el Fudo.']
  );
  nuevas.push({ id: rows[0].id, ...t });
  return rows[0].id;
}

// Un evento del sistema sobre una tarea que ya existe, una sola vez (lo marca en el detalle).
async function avisarUnaVez(clave, marca, texto) {
  const { rows } = await pool.query(
    `SELECT id FROM tareas WHERE clave = $1 AND NOT (detalle ? $2)`, [clave, marca]
  );
  if (!rows.length) return;
  await pool.query(`UPDATE tareas SET detalle = detalle || jsonb_build_object($2::text, true), updated_at = NOW() WHERE id = $1`, [rows[0].id, marca]);
  await pool.query(`INSERT INTO tarea_eventos (tarea_id, tipo, texto) VALUES ($1, 'sistema', $2)`, [rows[0].id, texto]);
}

const filas = items => (Array.isArray(items) ? items : []).filter(
  f => f && Object.values(f).some(x => x !== undefined && x !== null && String(x).trim() !== '')
);

// ── Un día ───────────────────────────────────────────────────────────────────
async function generarDia(fecha) {
  if (fecha < T.INICIO) return { fecha, nuevas: [], completo: false };
  const cubiertos = await localesCubiertos(fecha);
  if (!cubiertos.size) return { fecha, nuevas: [], completo: false };

  const dia = await armarDia(fecha);
  const nuevas = [];
  const idPorNombre = Object.fromEntries(dia.locales.map(l => [l.nombre, l.local_id]));
  const abiertos = new Set(dia.locales.filter(l => cubiertos.has(l.local_id) && l.tickets_sistema > 0).map(l => l.local_id));
  const nombreDe = id => corto(dia.locales.find(l => l.local_id === id)?.nombre);

  // No cargó: el turno tenía que mandar el reporte y cuando entró el Fudo no estaba.
  const slots = await slotsDelDia(fecha, abiertos);
  for (const s of slots) {
    const clave = `nocargo:${s.local_id}:${s.plantilla}:${s.turno}:${fecha}`;
    if (!s.reporte) {
      const l = dia.locales.find(x => x.local_id === s.local_id);
      await crear({
        tipo: 'no_cargo', local_id: s.local_id, fecha, clave,
        titulo: `${ETIQUETA_PLANTILLA[s.plantilla] || s.plantilla_nombre} ${s.turno.toLowerCase()}: no cargó el reporte`,
        detalle: { plantilla: s.plantilla, plantilla_nombre: s.plantilla_nombre, turno: s.turno, ventas_fudo: l?.ventas_sistema || 0, tickets_fudo: l?.tickets_sistema || 0 },
      }, nuevas);
    } else {
      // Si después de la alerta lo cargó igual (porque lo llamaron), queda anotado,
      // pero la alerta no se borra.
      const r = s.reporte;
      const cuando = new Date(r.enviado_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      await avisarUnaVez(clave, 'llego_tarde', `El reporte llegó después de la alerta: lo mandó ${r.usuario_nombre} el ${cuando}.`);
    }
  }

  for (const l of dia.locales) {
    if (!cubiertos.has(l.local_id)) continue;

    // Ventas: lo que dijeron los turnos contra el Fudo. Solo se compara con todos los
    // turnos adentro: si falta uno, eso ya es su propia alerta.
    if (l.diferencia !== null && Math.abs(l.diferencia) >= 1) {
      const turnos = l.reportes.map(r => {
        const rep = slots.find(s => s.reporte?.id === r.id)?.reporte;
        return { reporte_id: r.id, turno: r.turno, usuario: r.usuario_nombre, usuario_id: rep?.usuario_id || null };
      });
      // Lo que dijo cada turno, para que se vea en la tarea.
      const ventasPorReporte = (await pool.query(
        `SELECT id, COALESCE((respuestas->>'ventas')::numeric, 0) AS ventas FROM reportes WHERE id = ANY($1)`,
        [turnos.map(t => t.reporte_id)]
      )).rows;
      for (const t of turnos) t.ventas = Number(ventasPorReporte.find(v => v.id === t.reporte_id)?.ventas || 0);
      const causa = (await pool.query(
        `SELECT resultado FROM causas_conocidas WHERE local_id = $1 AND tipo = 'ventas' AND activa ORDER BY id DESC LIMIT 1`,
        [l.local_id]
      )).rows[0];
      await crear({
        tipo: 'ventas', local_id: l.local_id, fecha, clave: `ventas:${l.local_id}:${fecha}`,
        titulo: `Ventas no coinciden: los turnos dijeron ${$(Math.abs(l.diferencia))} ${l.diferencia > 0 ? 'más' : 'menos'} que Fudo`,
        detalle: { reportado: l.ventas_reportadas, fudo: l.ventas_sistema, diferencia: l.diferencia, turnos, causa_conocida: causa?.resultado || null },
      }, nuevas);
    }
  }

  // Vencimientos que vencen pronto. Se identifican por producto y fecha del paquete:
  // el mismo lote reportado por la mañana y por la tarde, o tres días seguidos, es una
  // sola tarea.
  for (const v of dia.novedades.vencimientos) {
    const local_id = idPorNombre[v.local];
    if (!cubiertos.has(local_id) || !v.producto || !v.vence) continue;
    if (v.dias === null || v.dias > T.DIAS_VENCIMIENTO) continue;
    await crear({
      tipo: 'vencimiento', local_id, fecha, clave: `venc:${local_id}:${v.producto}:${v.vence}`,
      titulo: `${v.producto}: ${v.cantidad ?? '?'} u. vencen el ${ddmm(v.vence)}${v.dias >= 0 ? ` (en ${v.dias} día${v.dias === 1 ? '' : 's'})` : ' (ya vencido)'}`,
      detalle: { producto: v.producto, cantidad: v.cantidad, vence: v.vence, dias: v.dias, quien: v.quien, turno: v.turno },
    }, nuevas);
  }

  // Mantenimiento: cada ítem abierto es una tarea. Si un turno dice que se solucionó,
  // queda anotado en la tarea; la cierra igual el encargado con la aprobación de un dueño.
  for (const m of dia.novedades.mantenimiento) {
    if (!m.id || !cubiertos.has(m.local_id)) continue;
    const clave = `mant:${m.id}`;
    if (m.estado === 'abierto') {
      await crear({
        tipo: 'mantenimiento', local_id: m.local_id, fecha: m.fecha < T.INICIO ? fecha : m.fecha, clave,
        titulo: `${m.rubro || 'Mantenimiento'}: ${m.texto}`,
        detalle: { item_id: m.id, rubro: m.rubro, texto: m.texto, reportado_por: m.reportado_por, desde: m.fecha, plan_anterior: m.plan || null },
        origen: m.fecha < T.INICIO
          ? `Venía abierto desde el ${ddmm(m.fecha)}${m.plan ? `. Lo último que se dijo: "${m.plan}"` : ''}.`
          : undefined,
      }, nuevas);
    } else if (m.estado === 'resuelto') {
      await avisarUnaVez(clave, 'turno_resolvio', `El turno dice que se solucionó (${ddmm(fecha)}).`);
    }
  }

  // Faltantes, faltas y quejas: una tarea por local y día con todo lo que dijeron.
  const porLocal = (lista) => {
    const g = {};
    for (const it of lista) {
      const id = idPorNombre[it.local];
      if (!cubiertos.has(id)) continue;
      (g[id] ||= []).push(it);
    }
    return g;
  };
  for (const [id, items] of Object.entries(porLocal(dia.novedades.faltantes))) {
    const lista = filas(items);
    await crear({
      tipo: 'faltante', local_id: Number(id), fecha, clave: `falt:${id}:${fecha}`,
      titulo: `Faltó: ${lista.map(i => i.insumo || i.producto || Object.values(i).find(x => typeof x === 'string' && x.length > 1)).filter(Boolean).join(', ')}`.slice(0, 200),
      detalle: { items: lista },
    }, nuevas);
  }
  for (const [id, items] of Object.entries(porLocal(dia.novedades.ausencias))) {
    await crear({
      tipo: 'ausencia', local_id: Number(id), fecha, clave: `aus:${id}:${fecha}`,
      titulo: `Faltas o tardanzas: ${items.map(i => [i.empleado, i.motivo].filter(Boolean).join(' (') + (i.motivo ? ')' : '')).join(', ')}`.slice(0, 200),
      detalle: { items },
    }, nuevas);
  }
  for (const [id, items] of Object.entries(porLocal(dia.novedades.quejas))) {
    await crear({
      tipo: 'queja', local_id: Number(id), fecha, clave: `queja:${id}:${fecha}`,
      titulo: `Queja: ${items[0].texto}`.slice(0, 200),
      detalle: { items },
    }, nuevas);
  }

  // El café: lo que se consumió según el pesaje contra lo que dice lo vendido.
  const ctrl = dia.cafe?.control;
  const cafe = dia.locales.find(l => l.tipo === 'cafeteria');
  if (cafe && cubiertos.has(cafe.local_id) && ctrl?.diferencia != null && Math.abs(ctrl.diferencia) >= T.KG_CAFE) {
    await crear({
      tipo: 'cafe', local_id: cafe.local_id, fecha, clave: `cafe:${fecha}`,
      titulo: `El café no cierra: el pesaje dice ${ctrl.real} kg y lo vendido ${ctrl.teorico} kg`,
      detalle: { real: ctrl.real, teorico: ctrl.teorico, diferencia: ctrl.diferencia },
    }, nuevas);
  }

  const activos = dia.locales.length;
  const completo = cubiertos.size >= activos;
  return {
    fecha, nuevas, completo, dia,
    reportes: { esperados: slots.length, recibidos: slots.filter(s => s.reporte).length },
  };
}

// ── Los avisos ───────────────────────────────────────────────────────────────
async function avisarDia(r) {
  // El reporte del día les llega una sola vez a los dueños, cuando están todos los Fudo.
  const marcado = await pool.query(
    'INSERT INTO dias_avisados (fecha) VALUES ($1) ON CONFLICT DO NOTHING RETURNING fecha', [r.fecha]
  );
  if (!marcado.rowCount) return;
  // El texto lo eligió Martín (11/10/2026): qué día es, cuánto se vendió, y que hay que entrar.
  const venta = r.dia.totales.ventas_sistema;
  await avisos.aDuenos({
    titulo: `Reporte del día ${diaLargo(r.fecha).toLowerCase()} creado`,
    texto: `Ventas del día ${$(venta)}. Hacé click para revisarlo.`,
    url: `/dia?fecha=${r.fecha}`,
    etiqueta: `dia-${r.fecha}`,
  });
}

// Después de un import: repasa la última semana. Va en segundo plano; el import ya
// respondió. Los cinco Excel se suben uno atrás del otro: si ya hay una pasada
// corriendo, no se larga otra en paralelo, se repite una vez al terminar.
let corriendo = null;
let otraVez = false;
function despuesDeImport() {
  if (corriendo) { otraVez = true; return corriendo; }
  corriendo = (async () => {
    let total = 0;
    do { otraVez = false; total += await repasarSemana(); } while (otraVez);
    return total;
  })().finally(() => { corriendo = null; });
  return corriendo;
}

async function repasarSemana() {
  const hoy = T.hoyMendoza();
  let desde = sumarDias(hoy, -7);
  if (desde < T.INICIO) desde = T.INICIO;
  const nuevas = [];
  for (let f = desde; f < hoy; f = sumarDias(f, 1)) {
    const r = await generarDia(f);
    nuevas.push(...r.nuevas.map(t => ({ ...t, fecha: f })));
    if (r.completo) await avisarDia(r);
  }
  if (nuevas.length) {
    const dias = [...new Set(nuevas.map(t => t.fecha))].sort();
    await avisos.aEncargados({
      titulo: `${nuevas.length} alerta${nuevas.length === 1 ? ' nueva' : 's nuevas'}`,
      texto: `${dias.map(diaLargo).join(', ')}: ${nuevas.slice(0, 3).map(t => `${nombreCorto(t)}`).join(' · ')}${nuevas.length > 3 ? '…' : ''}`,
      url: '/tareas',
      etiqueta: 'alertas',
    });
  }
  return nuevas.length;
}

function nombreCorto(t) {
  return `${T.TIPOS[t.tipo]?.label || t.tipo}`;
}

module.exports = { generarDia, despuesDeImport, localesCubiertos, slotsDelDia, avisarDia, diaLargo, corto };
