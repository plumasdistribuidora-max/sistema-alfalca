// La sección Dueños (23/10/2026): cierre del mes, objetivos, reuniones y el resumen.
//
// El método es el de la presentación "Crecer ordenados": números de cada unidad (EERR
// cerrado hasta el día 5) → rentabilidad objetivo del mes → microobjetivos con un solo
// dueño → tareas → semáforo cada miércoles. Los microobjetivos y las tareas son los del
// tablero de dueños (routes/tareasDuenos.js). Solo lo ven los dueños.

const express = require('express');
const pool    = require('../config/db');
const D       = require('../services/duenos');
const T       = require('../utils/tareas');
const { hoyStr } = require('../utils/fechas');
const { corto } = require('../services/alertas');

const router = express.Router();
const fail = (res, status, error) => res.status(status).json({ ok: false, error });
const nombreCorto = n => String(n || '').replace(/\s*\(.*\)\s*$/, '');
const NEGOCIOS = { entre_dos: 'Entre Dos', kankay: 'Kankay', senzen: 'Senzen', general: 'General' };
const MAX_MICROS = 3;

const sumarDias = (f, n) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// La reunión semanal es los miércoles (Martín, 23/10/2026): la semana de hoy es la del
// próximo miércoles, o hoy si es miércoles.
function miercolesDe(f) {
  const dow = new Date(`${f}T12:00:00Z`).getUTCDay();
  return sumarDias(f, (3 - dow + 7) % 7);
}

async function duenos() {
  return (await pool.query(`SELECT id, nombre FROM usuarios WHERE rol = 'admin' AND activo ORDER BY id`)).rows
    .map(u => ({ id: u.id, nombre: nombreCorto(u.nombre) }));
}

// Los microobjetivos de un mes, con su avance y el semáforo de cada semana.
async function microsDe(mes) {
  const { rows } = await pool.query(`
    SELECT m.id, m.nombre, m.dueno_id, u.nombre AS dueno_nombre, m.negocio, m.local_ids, m.area, m.meta,
           to_char(m.mes, 'YYYY-MM') AS mes, m.semaforo, m.nota, m.aporte_pts::float AS aporte_pts, m.aporte_monto::float AS aporte_monto, m.avance, m.resultado, m.viene_de,
           (SELECT COUNT(*) FROM tareas_duenos t WHERE t.microobjetivo_id = m.id)::int
             + (SELECT COUNT(*) FROM tareas t WHERE t.microobjetivo_id = m.id)::int AS tareas,
           (SELECT COUNT(*) FROM tareas_duenos t WHERE t.microobjetivo_id = m.id AND t.estado = 'terminada')::int
             + (SELECT COUNT(*) FROM tareas t WHERE t.microobjetivo_id = m.id AND t.estado = 'terminada')::int AS cerradas,
           EXISTS (SELECT 1 FROM microobjetivos x WHERE x.viene_de = m.id AND x.activo) AS pasado
    FROM microobjetivos m JOIN usuarios u ON u.id = m.dueno_id
    WHERE m.activo AND to_char(m.mes, 'YYYY-MM') = $1 ORDER BY m.id
  `, [mes]);
  const ids = rows.map(m => m.id);
  const semanas = ids.length ? (await pool.query(`
    SELECT microobjetivo_id, semana::text AS semana, semaforo, nota FROM microobjetivo_semanas
    WHERE microobjetivo_id = ANY($1) ORDER BY semana`, [ids])).rows : [];
  const locales = (await pool.query('SELECT id, nombre FROM locales')).rows;
  return rows.map(m => ({
    ...m,
    dueno: nombreCorto(m.dueno_nombre),
    negocio_label: NEGOCIOS[m.negocio],
    area_label: T.AREAS[m.area] || m.area,
    unidades: m.local_ids.map(id => corto(locales.find(l => l.id === id)?.nombre)).filter(Boolean),
    semanas: semanas.filter(s => s.microobjetivo_id === m.id).map(({ semana, semaforo, nota }) => ({ semana, semaforo, nota })),
  }));
}

// A qué unidades le suma un microobjetivo: los locales que eligió, todos los de Entre Dos
// si no eligió ninguno, y el consolidado si es de Entre Dos.
function unidadesDe(m) {
  if (m.negocio === 'kankay' || m.negocio === 'senzen') return [m.negocio];
  if (m.negocio !== 'entre_dos') return ['general'];
  const ks = D.UNIDADES.filter(u => u.local_id && (!m.local_ids.length || m.local_ids.includes(u.local_id))).map(u => u.k);
  return [...ks, 'entre_dos'];
}

async function objetivos(meses) {
  const { rows } = await pool.query('SELECT unidad, mes, pct::float AS pct FROM objetivos_mes WHERE mes = ANY($1) AND tipo = \'rent\'', [meses]);
  const out = {};
  for (const r of rows) (out[r.mes] ||= {})[r.unidad] = r.pct;
  return out;
}

// El objetivo de cada unidad en un mes, con su tipo: { unidad: { tipo, pct, monto, texto, cumplido } }
async function objetivosCompletos(mes) {
  const { rows } = await pool.query(`SELECT unidad, tipo, pct::float AS pct, monto::float AS monto, texto, cumplido FROM objetivos_mes WHERE mes = $1`, [mes]);
  return Object.fromEntries(rows.map(r => [r.unidad, r]));
}

// En qué unidad se muestra un microobjetivo: el local si eligió uno solo; Entre Dos si
// eligió varios o ninguno; Kankay, Senzen o General por su negocio.
function unidadDe(m) {
  if (m.negocio !== 'entre_dos') return m.negocio;
  if (m.local_ids.length === 1) return D.UNIDADES.find(u => u.local_id === m.local_ids[0])?.k || 'entre_dos';
  return 'entre_dos';
}

// Las tareas de cada microobjetivo: las de los dueños y las que le cargaron al Gordo.
async function tareasDe(ids) {
  if (!ids.length) return [];
  const hoy = hoyStr();
  const [du, go] = await Promise.all([
    pool.query(`SELECT t.id, t.titulo, t.estado, t.plazo::text AS plazo, t.microobjetivo_id, u.nombre AS quien, t.responsable_id
                FROM tareas_duenos t JOIN usuarios u ON u.id = t.responsable_id WHERE t.microobjetivo_id = ANY($1) ORDER BY t.created_at`, [ids]),
    pool.query(`SELECT t.id, t.titulo, t.estado, t.plazo::text AS plazo, t.microobjetivo_id FROM tareas t WHERE t.microobjetivo_id = ANY($1) ORDER BY t.created_at`, [ids]),
  ]);
  const venc = t => !['terminada', 'por_aprobar'].includes(t.estado) && !!t.plazo && t.plazo < hoy;
  return [
    ...du.rows.map(t => ({ ...t, quien: nombreCorto(t.quien), de: 'duenos', vencida: venc(t) })),
    ...go.rows.map(t => ({ ...t, quien: 'El Gordo', de: 'gordo', vencida: venc(t) })),
  ];
}

const UNIDADES_PANTALLA = [...D.UNIDADES.map(u => ({ k: u.k, nombre: u.nombre, negocio: u.negocio, local_id: u.local_id || null })), { k: 'general', nombre: 'General', negocio: 'general' }];

// ── GET /mes ─────────────────────────────────────────────────────────────────
// La pantalla de los dueños (24/10/2026), como la diapositiva 8 de "Crecer ordenados": cada
// unidad con su objetivo y, abajo, los microobjetivos de los dueños con sus tareas. Un mes
// que ya pasó se muestra igual, con lo que dio: así queda el historial.
router.get('/mes', async (req, res) => {
  try {
    const mes = D.esMes(req.query.mes) ? req.query.mes : D.mesPlan();
    const cerrado = mes < D.mesActual();
    const semana = miercolesDe(hoyStr());
    const anterior = D.sumarMeses(mes, -1);
    const [obj, micros, ds, numsAnt, numsMes, listos] = await Promise.all([
      objetivosCompletos(mes), microsDe(mes), duenos(),
      D.numerosDe(D.UNIDADES, anterior),
      cerrado ? D.numerosDe(D.UNIDADES, mes) : Promise.resolve({}),
      pool.query('SELECT COUNT(*)::int AS n FROM cierres_mes WHERE mes = $1', [D.mesACerrar()]),
    ]);
    const tareas = await tareasDe(micros.map(m => m.id));
    const conObjetivo = UNIDADES_PANTALLA.filter(u => obj[u.k] || micros.some(m => unidadDe(m) === u.k));
    const unidades = await Promise.all(conObjetivo.map(async u => {
      const o = obj[u.k] || null;
      const necesitaVentas = u.k !== 'general' && (o?.tipo === 'ventas' || o?.tipo === 'rent' || !o);
      const ventas = necesitaVentas ? await D.ventasMes(u.k, mes) : null;
      const real = u.k === 'general' ? null : (cerrado ? numsMes[u.k]?.pct ?? null : null);
      let cumplido = null;
      if (o && cerrado) {
        if (o.tipo === 'rent') cumplido = real == null ? null : real >= o.pct;
        else if (o.tipo === 'ventas') cumplido = ventas.total >= o.monto;
        else cumplido = o.cumplido;
      }
      return {
        ...u, objetivo: o, real, real_anterior: numsAnt[u.k]?.pct ?? null, ventas, cumplido,
        micros: micros.filter(m => unidadDe(m) === u.k).map(m => ({
          id: m.id, nombre: m.nombre, dueno_id: m.dueno_id, dueno: m.dueno, area: m.area, area_label: m.area_label, negocio: m.negocio,
          local_ids: m.local_ids, unidades: m.unidades, aporte_pts: m.aporte_pts, aporte_monto: m.aporte_monto, avance: m.avance, meta: m.meta,
          resultado: m.resultado, pasado: m.pasado,
          semaforo: m.semanas.find(x => x.semana === semana)?.semaforo || null,
          nota: m.semanas.find(x => x.semana === semana)?.nota || null,
          semanas: m.semanas,
          tareas: tareas.filter(t => t.microobjetivo_id === m.id),
        })),
      };
    }));
    res.json({ ok: true, data: {
      mes, nombre_mes: D.nombreMes(mes), cerrado, es_plan: mes === D.mesPlan(), semana, hoy: hoyStr(),
      anterior, nombre_anterior: D.nombreMes(anterior),
      unidades, sin_objetivo: UNIDADES_PANTALLA.filter(u => !conObjetivo.includes(u)),
      cierre: { mes: D.mesACerrar(), nombre_mes: D.nombreMes(D.mesACerrar()), listos: listos.rows[0].n, total: D.A_CERRAR.length },
      duenos: ds.map(d => ({ ...d, micros: micros.filter(m => m.dueno_id === d.id).length })), max_micros: MAX_MICROS,
    } });
  } catch (err) {
    console.error('[duenos/mes]', err);
    fail(res, 500, 'No se pudo cargar el mes');
  }
});

// ── Resumen ──────────────────────────────────────────────────────────────────
// Lo primero que ven los dueños: cómo viene cada unidad contra su objetivo y lo que pide
// atención esta semana.
router.get('/resumen', async (req, res) => {
  try {
    const mes = D.mesPlan();
    const cerrado = D.sumarMeses(mes, -1);
    const aCerrar = D.mesACerrar();
    const [nums, obj, micros, agenda, cierre] = await Promise.all([
      D.numerosDe(D.UNIDADES, cerrado),
      objetivos([mes, cerrado]),
      microsDe(mes),
      agendaSemana(miercolesDe(hoyStr())),
      D.faltanCerrar(aCerrar),
    ]);
    const unidades = [...D.UNIDADES.map(u => ({ k: u.k, nombre: u.nombre, negocio: u.negocio, consolidado: !!u.consolidado })),
      { k: 'general', nombre: 'General', negocio: 'general' }]
      .map(u => ({
        ...u,
        objetivo: obj[mes]?.[u.k] ?? null,
        real_anterior: nums[u.k]?.pct ?? null,
        objetivo_anterior: obj[cerrado]?.[u.k] ?? null,
        micros: micros.filter(m => unidadesDe(m).includes(u.k)).map(m => ({
          id: m.id, nombre: m.nombre, dueno: m.dueno, semaforo: m.semanas.find(s => s.semana === agenda.semana)?.semaforo || null,
          aporte_pts: m.aporte_pts,
        })),
      }));
    res.json({ ok: true, data: {
      mes, nombre_mes: D.nombreMes(mes), cerrado, nombre_cerrado: D.nombreMes(cerrado),
      cierre: { mes: aCerrar, nombre_mes: D.nombreMes(aCerrar), faltan: cierre.map(u => u.nombre), plazo: D.plazoCierre(aCerrar), vencido: hoyStr() > D.plazoCierre(aCerrar) && cierre.length > 0 },
      semana: agenda.semana,
      agenda: { rojos: agenda.rojos.length, sin_dato: agenda.sin_dato.length, vencidas: agenda.vencidas.length, para_cerrar: agenda.para_cerrar.length },
      unidades,
    } });
  } catch (err) {
    console.error('[duenos/resumen]', err);
    fail(res, 500, 'No se pudo cargar el resumen');
  }
});

// ── Cierre del mes ───────────────────────────────────────────────────────────
router.get('/cierre', async (req, res) => {
  try {
    const mes = D.esMes(req.query.mes) ? req.query.mes : D.mesACerrar();
    res.json({ ok: true, data: await D.cierre(mes) });
  } catch (err) {
    console.error('[duenos/cierre]', err);
    fail(res, 500, 'No se pudo cargar el cierre');
  }
});

// Números listos de una unidad. Pide que tenga los gastos cargados y las ventas del mes
// entero: sin eso la rentabilidad no es la real.
router.post('/cierre/:unidad/listo', async (req, res) => {
  try {
    const u = D.A_CERRAR.find(x => x.k === req.params.unidad);
    const mes = req.body.mes;
    if (!u || !D.esMes(mes)) return fail(res, 400, 'Unidad o mes inválido');
    const n = (await D.numerosDe([u], mes))[u.k];
    if (!n.gastos_cargados) return fail(res, 400, `Faltan cargar los gastos de ${u.nombre}`);
    if (!n.ventas_completas) return fail(res, 400, `Las ventas de ${u.nombre} llegan hasta el ${n.ventas_hasta || '—'}: falta el final del mes`);
    await pool.query(`INSERT INTO cierres_mes (unidad, mes, listo_por) VALUES ($1,$2,$3)
                      ON CONFLICT (unidad, mes) DO UPDATE SET listo_por = $3, listo_at = NOW()`, [u.k, mes, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[duenos/cierre listo]', err);
    fail(res, 500, 'No se pudo marcar');
  }
});

router.post('/cierre/:unidad/reabrir', async (req, res) => {
  try {
    if (!D.esMes(req.body.mes)) return fail(res, 400, 'Mes inválido');
    await pool.query('DELETE FROM cierres_mes WHERE unidad = $1 AND mes = $2', [req.params.unidad, req.body.mes]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[duenos/cierre reabrir]', err);
    fail(res, 500, 'No se pudo reabrir');
  }
});

// Los gastos de Senzen: renglones con nombre y monto.  { gastos: [{ nombre, monto }] }
router.put('/senzen-gastos/:mes', async (req, res) => {
  try {
    if (!D.esMes(req.params.mes)) return fail(res, 400, 'Mes inválido');
    const gastos = (Array.isArray(req.body.gastos) ? req.body.gastos : [])
      .map(g => ({ nombre: String(g.nombre || '').trim().slice(0, 80), monto: Math.max(0, Number(g.monto) || 0) }))
      .filter(g => g.nombre);
    await pool.query(`INSERT INTO senzen_eerr (mes, gastos) VALUES ($1, $2::jsonb)
                      ON CONFLICT (mes) DO UPDATE SET gastos = $2::jsonb, updated_at = NOW()`, [req.params.mes, JSON.stringify(gastos)]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[duenos/senzen-gastos]', err);
    fail(res, 500, 'No se pudieron guardar los gastos');
  }
});

// ── Objetivos ────────────────────────────────────────────────────────────────
// El mes que se planifica: objetivo de cada unidad, el real del mes anterior y las
// palancas con lo que aporta cada una.
router.get('/objetivos', async (req, res) => {
  try {
    const mes = D.esMes(req.query.mes) ? req.query.mes : D.mesPlan();
    const anterior = D.sumarMeses(mes, -1);
    const [nums, obj, micros, ds] = await Promise.all([
      D.numerosDe(D.UNIDADES, anterior), objetivos([mes, anterior]), microsDe(mes), duenos(),
    ]);
    const unidades = [...D.UNIDADES, { k: 'general', nombre: 'General', negocio: 'general' }].map(u => {
      const ms = micros.filter(m => unidadesDe(m).includes(u.k));
      const real = nums[u.k]?.pct ?? null;
      const objetivo = obj[mes]?.[u.k] ?? null;
      const suma = ms.reduce((s, m) => s + (m.aporte_pts || 0), 0);
      return {
        k: u.k, nombre: u.nombre, negocio: u.negocio, consolidado: !!u.consolidado,
        objetivo, real_anterior: real, objetivo_anterior: obj[anterior]?.[u.k] ?? null,
        cmv_anterior: nums[u.k]?.cmv_pct ?? null,
        suma_aportes: Math.round(suma * 10) / 10,
        // Cuánto falta para que las palancas lleguen al objetivo.
        falta: objetivo != null && real != null ? Math.round((objetivo - real - suma) * 10) / 10 : null,
        micros: ms.map(m => m.id),
      };
    });
    const porDueno = ds.map(d => ({ ...d, micros: micros.filter(m => m.dueno_id === d.id).length }));
    const locales = (await pool.query('SELECT id, nombre FROM locales WHERE activo ORDER BY id')).rows.map(l => ({ id: l.id, nombre: corto(l.nombre) }));
    res.json({ ok: true, data: {
      mes, nombre_mes: D.nombreMes(mes), anterior, nombre_anterior: D.nombreMes(anterior),
      unidades, micros, duenos: porDueno, max_micros: MAX_MICROS, locales, negocios: NEGOCIOS, areas: T.AREAS,
    } });
  } catch (err) {
    console.error('[duenos/objetivos]', err);
    fail(res, 500, 'No se pudieron cargar los objetivos');
  }
});

// { tipo: rent | ventas | meta, valor } — valor vacío lo borra. rent = % de ganancia sobre la
// venta neta; ventas = pesos del mes (con IVA); meta = el texto. { cumplido } marca una meta.
router.put('/objetivos/:unidad/:mes', async (req, res) => {
  try {
    const { unidad, mes } = req.params;
    if (!UNIDADES_PANTALLA.some(u => u.k === unidad) || !D.esMes(mes)) return fail(res, 400, 'Unidad o mes inválido');
    if ('cumplido' in req.body) {
      await pool.query('UPDATE objetivos_mes SET cumplido = $3, updated_at = NOW() WHERE unidad = $1 AND mes = $2', [unidad, mes, req.body.cumplido === null ? null : !!req.body.cumplido]);
      return res.json({ ok: true });
    }
    const tipo = unidad === 'general' ? 'meta' : (['rent', 'ventas', 'meta'].includes(req.body.tipo) ? req.body.tipo : 'rent');
    const valor = req.body.valor ?? req.body.pct;
    if (valor === '' || valor == null) {
      await pool.query('DELETE FROM objetivos_mes WHERE unidad = $1 AND mes = $2', [unidad, mes]);
      return res.json({ ok: true });
    }
    let pct = null, monto = null, texto = null;
    if (tipo === 'rent') {
      pct = Number(String(valor).replace(',', '.'));
      if (!Number.isFinite(pct) || pct < -50 || pct > 80) return fail(res, 400, 'La rentabilidad es un % de ganancia sobre la venta neta, por ejemplo 14');
    } else if (tipo === 'ventas') {
      monto = Math.round(Number(String(valor).replace(/[^\d,]/g, '').replace(',', '.')));
      if (!(monto > 0)) return fail(res, 400, 'Escribí cuánto hay que vender en el mes, por ejemplo 10.000.000');
    } else {
      texto = String(valor).trim().slice(0, 200);
      if (texto.length < 3) return fail(res, 400, 'Escribí el objetivo');
    }
    await pool.query(`INSERT INTO objetivos_mes (unidad, mes, tipo, pct, monto, texto, cargado_por) VALUES ($1,$2,$3,$4,$5,$6,$7)
                      ON CONFLICT (unidad, mes) DO UPDATE SET tipo = $3, pct = $4, monto = $5, texto = $6, cargado_por = $7, updated_at = NOW()`,
    [unidad, mes, tipo, pct, monto, texto, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[duenos/objetivos PUT]', err);
    fail(res, 500, 'No se pudo guardar el objetivo');
  }
});

// Un microobjetivo del mes que se cerró: cumplido o no. Si sigue, se pasa al mes siguiente.
router.post('/microobjetivos/:id(\\d+)/resultado', async (req, res) => {
  try {
    const r = ['cumplido', 'no_cumplido'].includes(req.body.resultado) ? req.body.resultado : null;
    await pool.query('UPDATE microobjetivos SET resultado = $2, updated_at = NOW() WHERE id = $1 AND activo', [req.params.id, r]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[duenos/micro resultado]', err);
    fail(res, 500, 'No se pudo guardar');
  }
});

router.post('/microobjetivos/:id(\\d+)/pasar', async (req, res) => {
  try {
    const m = (await pool.query(`SELECT *, to_char(mes, 'YYYY-MM') AS ym FROM microobjetivos WHERE id = $1 AND activo`, [req.params.id])).rows[0];
    if (!m) return fail(res, 404, 'No existe ese microobjetivo');
    const sig = D.sumarMeses(m.ym, 1);
    const ya = (await pool.query(`SELECT 1 FROM microobjetivos WHERE viene_de = $1 AND activo`, [m.id])).rows[0];
    if (ya) return fail(res, 400, 'Ya está pasado al mes siguiente');
    const n = (await pool.query(`SELECT COUNT(*)::int AS n FROM microobjetivos WHERE activo AND dueno_id = $1 AND to_char(mes, 'YYYY-MM') = $2`, [m.dueno_id, sig])).rows[0].n;
    if (n >= MAX_MICROS) return fail(res, 400, `Ese dueño ya tiene ${MAX_MICROS} microobjetivos en ${D.nombreMes(sig)}`);
    const nuevo = (await pool.query(`
      INSERT INTO microobjetivos (nombre, dueno_id, negocio, local_ids, area, meta, mes, aporte_pts, aporte_monto, avance, viene_de, creado_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [m.nombre, m.dueno_id, m.negocio, m.local_ids, m.area, m.meta, `${sig}-01`, m.aporte_pts, m.aporte_monto, m.avance, m.id, req.user.id])).rows[0].id;
    // Las tareas que no se cerraron siguen colgando del microobjetivo nuevo.
    await pool.query(`UPDATE tareas_duenos SET microobjetivo_id = $2 WHERE microobjetivo_id = $1 AND estado <> 'terminada'`, [m.id, nuevo]);
    await pool.query(`UPDATE tareas SET microobjetivo_id = $2 WHERE microobjetivo_id = $1 AND estado <> 'terminada'`, [m.id, nuevo]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[duenos/micro pasar]', err);
    fail(res, 500, 'No se pudo pasar al mes siguiente');
  }
});

// ── Reunión semanal ──────────────────────────────────────────────────────────
// La agenda en el orden de la presentación: 1) microobjetivos en rojo, 2) tareas vencidas,
// 3) esperando cierre, 4) el resto.
async function agendaSemana(semana) {
  const mes = D.mesDeSemana(semana);
  const hoy = hoyStr();
  const [micros, tdu, gordo] = await Promise.all([
    microsDe(mes),
    pool.query(`
      SELECT t.id, t.titulo, t.estado, t.plazo::text AS plazo, t.negocio, u.nombre AS responsable, m.nombre AS micro
      FROM tareas_duenos t JOIN usuarios u ON u.id = t.responsable_id LEFT JOIN microobjetivos m ON m.id = t.microobjetivo_id
      WHERE t.estado <> 'terminada' ORDER BY t.plazo NULLS LAST, t.id`),
    // Del Gordo: lo que espera cierre y lo vencido que cuelga de un microobjetivo.
    pool.query(`
      SELECT t.id, t.titulo, t.estado, t.plazo::text AS plazo, m.nombre AS micro
      FROM tareas t LEFT JOIN microobjetivos m ON m.id = t.microobjetivo_id
      WHERE t.estado <> 'terminada' AND (t.estado = 'por_aprobar' OR t.microobjetivo_id IS NOT NULL)
      ORDER BY t.plazo NULLS LAST, t.id`),
  ]);
  const conSem = micros.map(m => {
    const s = m.semanas.find(x => x.semana === semana);
    return { ...m, semaforo_semana: s?.semaforo || null, nota_semana: s?.nota || null };
  });
  const vencida = t => t.estado !== 'por_aprobar' && t.plazo && t.plazo < hoy;
  const duenoT = tdu.rows.map(t => ({ ...t, responsable: nombreCorto(t.responsable), de: 'duenos' }));
  const gordoT = gordo.rows.map(t => ({ ...t, responsable: 'El Gordo', de: 'gordo' }));
  return {
    semana, mes,
    rojos: conSem.filter(m => m.semaforo_semana === 'rojo'),
    sin_dato: conSem.filter(m => !m.semaforo_semana),
    resto: conSem.filter(m => m.semaforo_semana && m.semaforo_semana !== 'rojo'),
    vencidas: [...duenoT, ...gordoT].filter(vencida),
    para_cerrar: [...duenoT, ...gordoT].filter(t => t.estado === 'por_aprobar'),
  };
}

router.get('/reunion-semanal', async (req, res) => {
  try {
    const semana = /^\d{4}-\d{2}-\d{2}$/.test(req.query.semana || '') ? miercolesDe(req.query.semana) : miercolesDe(hoyStr());
    const a = await agendaSemana(semana);
    res.json({ ok: true, data: {
      ...a, hoy: hoyStr(), anterior: sumarDias(semana, -7), siguiente: sumarDias(semana, 7),
      es_actual: semana === miercolesDe(hoyStr()), duenos: await duenos(),
    } });
  } catch (err) {
    console.error('[duenos/reunion-semanal]', err);
    fail(res, 500, 'No se pudo armar la reunión');
  }
});

// El semáforo y la nota de una semana: solo el dueño del microobjetivo.  { semana, semaforo?, nota? }
router.post('/microobjetivos/:id(\\d+)/semana', async (req, res) => {
  try {
    const m = (await pool.query('SELECT id, dueno_id FROM microobjetivos WHERE id = $1 AND activo', [req.params.id])).rows[0];
    if (!m) return fail(res, 404, 'No existe ese microobjetivo');
    if (m.dueno_id !== req.user.id) return fail(res, 403, 'El semáforo lo pone el dueño del microobjetivo');
    const semana = miercolesDe(/^\d{4}-\d{2}-\d{2}$/.test(req.body.semana || '') ? req.body.semana : hoyStr());
    await guardarSemana(m.id, semana, req.body, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[duenos/micro semana]', err);
    fail(res, 500, 'No se pudo guardar');
  }
});

async function guardarSemana(microId, semana, body, usuarioId) {
  const sem = 'semaforo' in body ? (['verde', 'amarillo', 'rojo'].includes(body.semaforo) ? body.semaforo : null) : undefined;
  const nota = 'nota' in body ? (String(body.nota || '').trim().slice(0, 600) || null) : undefined;
  await pool.query(`
    INSERT INTO microobjetivo_semanas (microobjetivo_id, semana, semaforo, nota, usuario_id)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (microobjetivo_id, semana) DO UPDATE SET
      semaforo = CASE WHEN $6 THEN EXCLUDED.semaforo ELSE microobjetivo_semanas.semaforo END,
      nota     = CASE WHEN $7 THEN EXCLUDED.nota ELSE microobjetivo_semanas.nota END,
      usuario_id = $5, updated_at = NOW()
  `, [microId, semana, sem ?? null, nota ?? null, usuarioId, sem !== undefined, nota !== undefined]);
  // El tablero de dueños muestra el último semáforo y la última nota.
  if (semana === miercolesDe(hoyStr())) {
    if (sem !== undefined) await pool.query('UPDATE microobjetivos SET semaforo = $2, updated_at = NOW() WHERE id = $1', [microId, sem]);
    if (nota !== undefined) await pool.query('UPDATE microobjetivos SET nota = $2, nota_at = NOW(), updated_at = NOW() WHERE id = $1', [microId, nota]);
  }
}

// ── Reunión mensual ──────────────────────────────────────────────────────────
// mes = el mes que se planifica. Primero tienen que estar los números del anterior.
router.get('/reunion-mensual', async (req, res) => {
  try {
    const mes = D.esMes(req.query.mes) ? req.query.mes : D.mesPlan();
    const anterior = D.sumarMeses(mes, -1);
    const [cierre, obj, microsAnt, microsMes, ds, { rows: [r] }] = await Promise.all([
      D.cierre(anterior), objetivos([mes, anterior]), microsDe(anterior), microsDe(mes), duenos(),
      pool.query(`SELECT mes, fecha::text AS fecha, notas, terminada_at, u.nombre AS terminada_por
                  FROM reuniones_mes LEFT JOIN usuarios u ON u.id = terminada_por WHERE mes = $1`, [mes]),
    ]);
    const unidades = cierre.unidades.map(u => ({
      k: u.k, nombre: u.nombre, consolidado: u.consolidado, real: u.pct, objetivo_anterior: obj[anterior]?.[u.k] ?? null,
      objetivo: obj[mes]?.[u.k] ?? null,
    }));
    res.json({ ok: true, data: {
      mes, nombre_mes: D.nombreMes(mes), anterior, nombre_anterior: D.nombreMes(anterior),
      reunion: r ? { ...r, terminada_por: nombreCorto(r.terminada_por) } : { mes, fecha: null, notas: null, terminada_at: null },
      cierre: { completo: cierre.completo, faltan: cierre.faltan, plazo: cierre.plazo },
      unidades, micros_anterior: microsAnt,
      por_dueno: ds.map(d => ({ ...d, micros: microsMes.filter(m => m.dueno_id === d.id).length })),
      max_micros: MAX_MICROS,
    } });
  } catch (err) {
    console.error('[duenos/reunion-mensual]', err);
    fail(res, 500, 'No se pudo cargar la reunión del mes');
  }
});

// { fecha?, notas?, terminar? } — terminar exige los números del mes anterior cerrados.
router.post('/reunion-mensual/:mes', async (req, res) => {
  try {
    const mes = req.params.mes;
    if (!D.esMes(mes)) return fail(res, 400, 'Mes inválido');
    await pool.query('INSERT INTO reuniones_mes (mes) VALUES ($1) ON CONFLICT DO NOTHING', [mes]);
    if ('fecha' in req.body) {
      const f = /^\d{4}-\d{2}-\d{2}$/.test(req.body.fecha || '') ? req.body.fecha : null;
      await pool.query('UPDATE reuniones_mes SET fecha = $2 WHERE mes = $1', [mes, f]);
    }
    if ('notas' in req.body) await pool.query('UPDATE reuniones_mes SET notas = $2 WHERE mes = $1', [mes, String(req.body.notas || '').trim().slice(0, 4000) || null]);
    if (req.body.terminar) {
      const faltan = await D.faltanCerrar(D.sumarMeses(mes, -1));
      if (faltan.length) return fail(res, 400, `Primero hay que cerrar los números de ${faltan.map(u => u.nombre).join(', ')}`);
      await pool.query('UPDATE reuniones_mes SET terminada_por = $2, terminada_at = NOW() WHERE mes = $1', [mes, req.user.id]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[duenos/reunion-mensual POST]', err);
    fail(res, 500, 'No se pudo guardar');
  }
});

// El historial (24/10/2026): cada mes que pasó, con el objetivo de cada unidad, lo que dio y
// cuántos microobjetivos cumplió cada dueño. Sale de lo guardado: nada se pisa.
router.get('/historial', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT mes FROM objetivos_mes UNION SELECT to_char(mes, 'YYYY-MM') FROM microobjetivos WHERE activo ORDER BY 1 DESC LIMIT 12`);
    const meses = rows.map(r => r.mes).filter(m => m < D.mesActual());
    const ds = await duenos();
    const out = [];
    for (const mes of meses) {
      const [obj, nums, micros] = await Promise.all([objetivosCompletos(mes), D.numerosDe(D.UNIDADES, mes), microsDe(mes)]);
      const unidades = [];
      for (const u of UNIDADES_PANTALLA) {
        const o = obj[u.k];
        if (!o) continue;
        let real = null, cumplido = null;
        if (o.tipo === 'rent') { real = nums[u.k]?.pct ?? null; cumplido = real == null ? null : real >= o.pct; }
        else if (o.tipo === 'ventas') { real = (await D.ventasMes(u.k, mes)).total; cumplido = real >= o.monto; }
        else cumplido = o.cumplido;
        unidades.push({ k: u.k, nombre: u.nombre, negocio: u.negocio, objetivo: o, real, cumplido });
      }
      out.push({
        mes, nombre_mes: D.nombreMes(mes), unidades,
        por_dueno: ds.map(d => {
          const ms = micros.filter(m => m.dueno_id === d.id);
          return { id: d.id, nombre: d.nombre, total: ms.length, cumplidos: ms.filter(m => m.resultado === 'cumplido').length, sin_marcar: ms.filter(m => !m.resultado).length };
        }),
      });
    }
    res.json({ ok: true, data: { meses: out, duenos: ds } });
  } catch (err) {
    console.error('[duenos/historial]', err);
    fail(res, 500, 'No se pudo cargar el historial');
  }
});

module.exports = router;
module.exports.miercolesDe = miercolesDe;
module.exports.guardarSemana = guardarSemana;
