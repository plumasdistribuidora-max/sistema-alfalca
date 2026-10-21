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
  if (tareas.length) {
    await unaVez(`senzen:hoy:${hoy}`, async () => {
      const { rows } = await pool.query(`SELECT id FROM usuarios WHERE rol = 'vendedora' AND activo`);
      const atrasadas = tareas.filter(t => t.vence < hoy).length;
      await enviarAUsuarios(rows.map(r => r.id), {
        titulo: 'Senzen · Para hoy',
        texto: `Tenés ${plural(tareas.length, 'comercio', 'comercios')} para hablar hoy${atrasadas ? ` (${atrasadas} de días anteriores)` : ''}.`,
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
        titulo: 'Senzen · La semana de Pepa',
        texto: `${plural(s.contactos, 'contacto', 'contactos')}${meta(s.contactos, 'contactos')} (${plural(s.visitas, 'visita', 'visitas')}), ` +
               `${plural(s.nuevos, 'cliente nuevo', 'clientes nuevos')}${meta(s.nuevos, 'nuevos')}, ` +
               `$ ${Math.round(s.ventas).toLocaleString('es-AR')} facturados. Tareas hechas: ${s.tareasHechas}, a tiempo ${s.tareasATiempo}.`,
        url: '/marcas/senzen?tab=pepa', etiqueta: 'senzen_semana',
      });
    });
  }
}

module.exports = { revisar };
