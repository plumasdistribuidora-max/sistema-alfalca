// Los avisos de la sección Dueños (23/10/2026). Se revisan cada diez minutos y cada uno
// sale una sola vez (avisos_enviados):
//   · del 1 al 5, a las 9: al responsable del cierre (Tincho), qué unidades le faltan;
//   · el 6 a las 9, si quedó algo sin cerrar: a los cuatro dueños;
//   · los martes a las 18: a cada dueño, los microobjetivos sin semáforo para el miércoles;
//   · el día antes de la reunión del mes, a las 18: a los cuatro dueños.

const pool = require('../config/db');
const avisos = require('./avisos');
const D = require('./duenos');
const { TZ, hoyStr } = require('../utils/fechas');

const ahoraMza = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return Number(p.hour) * 60 + Number(p.minute);
};
const ddmm = f => String(f).slice(0, 10).split('-').reverse().slice(0, 2).join('/');
const sumarDias = (f, n) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

function mandar(ids, simbolo, titulo, texto, url, etiqueta) {
  const a = [...new Set(ids.filter(Boolean))];
  if (!a.length) return Promise.resolve(0);
  return avisos.enviarAUsuarios(a, { titulo: `Dueños · ${simbolo} ${titulo}`, texto, url, etiqueta });
}

async function unaVez(clave, fn) {
  const { rowCount } = await pool.query('INSERT INTO avisos_enviados (clave) VALUES ($1) ON CONFLICT DO NOTHING', [clave]);
  if (rowCount) await fn();
}

const duenos = async () => (await pool.query(`SELECT id FROM usuarios WHERE rol = 'admin' AND activo`)).rows.map(r => r.id);
const responsable = async () => Number((await pool.query(`SELECT valor FROM parametros WHERE clave = 'cierre_responsable_id'`)).rows[0]?.valor) || null;

async function revisar() {
  const hoy = hoyStr();
  const min = ahoraMza();
  const dia = Number(hoy.slice(8, 10));
  const mes = D.mesACerrar();

  // Cierre del mes.
  if (min >= 9 * 60 && min < 21 * 60 && dia <= 6) {
    const faltan = await D.faltanCerrar(mes);
    if (faltan.length && dia <= 5) {
      await unaVez(`duenos-cierre-${hoy}`, async () => mandar([await responsable()], '📊',
        `Cierre de ${D.nombreMes(mes)} · ${plural(faltan.length, 'unidad falta', 'unidades faltan')}`,
        `${faltan.map(u => u.nombre).join(', ')}. Hay tiempo hasta el ${ddmm(D.plazoCierre(mes))}: sin números no hay reunión.`,
        '/duenos/cierre', 'duenos-cierre'));
    }
    if (faltan.length && dia === 6) {
      await unaVez(`duenos-cierre-vencido-${mes}`, async () => mandar(await duenos(), '⚠️',
        `Los números de ${D.nombreMes(mes)} no se cerraron a tiempo`,
        `Faltan: ${faltan.map(u => u.nombre).join(', ')}. La reunión del mes espera a que estén.`, '/duenos/cierre', 'duenos-cierre'));
    }
  }

  // Martes a la tarde: el semáforo para la reunión del miércoles.
  const dow = new Date(`${hoy}T12:00:00Z`).getUTCDay();
  if (dow === 2 && min >= 18 * 60 && min < 21 * 60) {
    const semana = sumarDias(hoy, 1);
    const { rows } = await pool.query(`
      SELECT m.dueno_id, COUNT(*)::int AS n FROM microobjetivos m
      LEFT JOIN microobjetivo_semanas s ON s.microobjetivo_id = m.id AND s.semana = $1
      WHERE m.activo AND to_char(m.mes, 'YYYY-MM') = $2 AND s.semaforo IS NULL
      GROUP BY m.dueno_id`, [semana, D.mesDeSemana(semana)]);
    for (const r of rows) {
      await unaVez(`duenos-semaforo-${semana}-${r.dueno_id}`, () => mandar([r.dueno_id], '🚦',
        'Mañana es la reunión de dueños', `Poné el semáforo de ${plural(r.n, 'microobjetivo tuyo', 'microobjetivos tuyos')}: verde, amarillo o rojo.`,
        '/duenos/reuniones', 'duenos-semaforo'));
    }
  }

  // El día antes de la reunión del mes.
  if (min >= 18 * 60 && min < 21 * 60) {
    const { rows: [r] } = await pool.query(`SELECT mes FROM reuniones_mes WHERE fecha = $1 AND terminada_at IS NULL`, [sumarDias(hoy, 1)]);
    if (r) {
      const faltan = await D.faltanCerrar(D.sumarMeses(r.mes, -1));
      await unaVez(`duenos-reunion-mes-${r.mes}`, async () => mandar(await duenos(), '📅',
        `Mañana es la reunión de ${D.nombreMes(r.mes)}`,
        faltan.length ? `Todavía faltan los números de ${faltan.map(u => u.nombre).join(', ')}.` : 'Los números del mes están cerrados. Traigan sus microobjetivos.',
        '/duenos/reuniones', 'duenos-reunion'));
    }
  }
}

module.exports = { revisar };
