// Senzen en segundo plano: cada hora trae Dux, arma las tareas y manda los avisos.
//
// - De 8 a 21 (Mendoza): lee Dux y genera las tareas de segunda visita y clientes dormidos.
// - Todos los días desde las 8: a Pepa, cuántos comercios tiene para hablar hoy.
// - Los lunes desde las 9: a los dueños, cómo le fue a Pepa la semana anterior.

const pool = require('../config/db');
const senzen = require('./senzen');
const { sincronizar } = require('./senzenDux');
const { enviarAUsuarios, aDuenos } = require('./avisos');
const { TZ, hoyStr } = require('../utils/fechas');
const { SIMBOLO } = require('./tareasAvisos');

const horaMza = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));

async function unaVez(clave, fn) {
  const { rowCount } = await pool.query('INSERT INTO avisos_enviados (clave) VALUES ($1) ON CONFLICT DO NOTHING', [clave]);
  if (rowCount) await fn();
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

async function revisar() {
  const hora = horaMza(), hoy = hoyStr();
  if (hora < 8 || hora > 21) return;

  if (process.env.DUX_API_TOKEN) {
    try { await sincronizar(); } catch (err) { console.warn('[senzen] Dux:', err.message); }
  }
  await senzen.generarTareas();

  const tareas = (await senzen.tareasAbiertas()).filter(t => t.vence <= hoy);
  // Lo que le falta de comercios nuevos en la semana, si los dueños pusieron cuántos.
  const desde = senzen.lunes(hoy);
  const plan = await senzen.planSemana(desde);
  const { rows: [{ n: hechos }] } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM senzen_contactos WHERE tipo = 'nuevo' AND fecha BETWEEN $1 AND $2`, [desde, senzen.sumarDias(desde, 6)]);
  // Con el plan repartido por día, lo que le toca hasta hoy; si no, lo que falta de la semana.
  const hastaHoy = plan.por_dia ? plan.por_dia.slice(0, ((new Date(hoy + 'T12:00:00Z').getUTCDay() + 6) % 7) + 1).reduce((a, v) => a + v, 0) : plan.meta;
  const faltan = hastaHoy ? Math.max(0, hastaHoy - hechos) : 0;
  if (tareas.length || faltan) {
    await unaVez(`senzen:hoy:${hoy}`, async () => {
      const atrasadas = tareas.filter(t => t.vence < hoy).length;
      await enviarAUsuarios(await vendedoras(), {
        titulo: `Senzen · ${SIMBOLO.hoy} Tus tareas de hoy`,
        texto: [tareas.length && `Tenés ${plural(tareas.length, 'cliente', 'clientes')} para contactar hoy${atrasadas ? ` (${atrasadas} de días anteriores)` : ''}.`,
                faltan && `${plan.por_dia ? 'Hoy tenés que visitar' : 'Esta semana te faltan'} ${plural(faltan, 'comercio nuevo', 'comercios nuevos')}.`].filter(Boolean).join(' '),
        url: '/', etiqueta: 'senzen_hoy',
      });
    });
  }

  // Lunes: la semana anterior de Pepa.
  if (new Date(hoy + 'T12:00:00Z').getUTCDay() === 1 && hora >= 9) {
    const desde = senzen.sumarDias(hoy, -7);
    await unaVez(`senzen:semana:${desde}`, async () => {
      const [s, m] = await Promise.all([senzen.semana(desde), senzen.metas()]);
      const meta = (v, k) => (m[k] ? ` de ${m[k]}` : '');
      await aDuenos({
        titulo: `Senzen · ${SIMBOLO.reporte} La semana de Pepa`,
        texto: `${plural(s.contactos, 'contacto', 'contactos')}${meta(s.contactos, 'contactos')} (${plural(s.visitas, 'visita', 'visitas')}), ` +
               `${plural(s.nuevos, 'cliente nuevo', 'clientes nuevos')}${meta(s.nuevos, 'nuevos')}, ` +
               `$ ${Math.round(s.ventas).toLocaleString('es-AR')} facturados. Tareas hechas: ${s.tareasHechas}, a tiempo ${s.tareasATiempo}.`,
        url: '/marcas/senzen?tab=pepa', etiqueta: 'senzen_semana',
      });
    });
  }
}

// ── Los reportes de Pepa ─────────────────────────────────────────────────────
// Mismos símbolos que las tareas (Martín, 23/10/2026) y nada de 22 a 8 h.
const vendedoras = async () => (await pool.query(`SELECT id FROM usuarios WHERE rol = 'vendedora' AND activo`)).rows.map(r => r.id);
const duenos = async () => (await pool.query(`SELECT id FROM usuarios WHERE rol = 'admin' AND activo`)).rows.map(r => r.id);
const deNoche = () => { const h = horaMza(); return h < 8 || h >= 22; };
const nombre = u => String(u?.nombre || '').replace(/\s*\(.*\)\s*$/, '');
const ddmm = f => (f ? String(f).slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '');

function enFondo(promesa, ctx) { promesa.catch(err => console.warn(`[senzen avisos] ${ctx}:`, err.message)); }

// Pepa cargó un reporte: a los dueños, un solo aviso con todo lo que espera, que se va actualizando.
function paraAprobar(quien) {
  enFondo((async () => {
    if (deNoche()) return;
    const { rows } = await pool.query(`
      SELECT c.nombre FROM senzen_contactos k JOIN senzen_comercios c ON c.id = k.comercio_id
      WHERE k.aprobacion = 'pendiente' ORDER BY k.creado_en`);
    if (!rows.length) return;
    await enviarAUsuarios(await duenos(), {
      titulo: `Senzen · ${SIMBOLO.cerrar} Para aprobar · ${nombre(quien)} cargó ${plural(rows.length, 'reporte', 'reportes')}`,
      texto: rows.slice(0, 3).map(r => r.nombre).join(' · ') + (rows.length > 3 ? ` y ${rows.length - 3} más` : ''),
      url: '/senzen/semana', etiqueta: 'senzen_aprobar',
    });
  })(), 'para aprobar');
}

// Un dueño aprobó o devolvió un reporte: a quien lo cargó.
function respuesta(k, quien, accion, texto) {
  enFondo((async () => {
    if (deNoche()) return;
    await enviarAUsuarios([k.usuario_id], accion === 'aprobar'
      ? { titulo: `Senzen · ${SIMBOLO.cerrar} ${nombre(quien)} aprobó · ${k.nombre}`, texto: texto || 'Tu reporte quedó aprobado.', url: '/', etiqueta: `senzen_k${k.id}` }
      : { titulo: `Senzen · ${SIMBOLO.pedido} ${nombre(quien)} te pidió más · ${k.nombre}`, texto, url: '/', etiqueta: `senzen_k${k.id}` });
  })(), 'respuesta');
}

// Un dueño le encargó contactar a un cliente.
function encargo(comercio, vence, nota, quien) {
  enFondo((async () => {
    if (deNoche()) return;
    await enviarAUsuarios(await vendedoras(), {
      titulo: `Senzen · ${SIMBOLO.hoy} ${nombre(quien)} te encargó · ${comercio}`,
      texto: `Para el ${ddmm(vence)}${nota ? `: ${nota}` : ''}.`, url: '/', etiqueta: 'senzen_encargo',
    });
  })(), 'encargo');
}

module.exports = { revisar, paraAprobar, respuesta, encargo };
