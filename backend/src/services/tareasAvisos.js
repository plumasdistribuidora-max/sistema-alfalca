// Los avisos de las tareas (23/10/2026).
//
// Antes cada cambio en una tarea les llegaba a los cuatro dueños y al encargado, también
// al que lo hizo, y se veían igual que el reporte del día. Ahora:
//   · cada aviso le llega solo a quien le toca, y nunca al que hizo el cambio;
//   · el título arranca con un símbolo por tema (lo eligió Martín): en el iPhone no se
//     puede pintar un aviso, así que el símbolo es lo que dice de qué se trata;
//   · de 22 a 8 no sale ningún aviso de tareas: lo de la noche entra en el de la mañana;
//   · los pedidos de cierre se juntan en uno solo que se va actualizando;
//   · hay tres repasos: tus tareas de hoy (8:30), mañana vence (18:00) y se venció (9:00).

const pool = require('../config/db');
const avisos = require('./avisos');
const T = require('../utils/tareas');
const { TZ, hoyStr } = require('../utils/fechas');

const SIMBOLO = {
  hoy: '📋', vence: '⏰', vencio: '⚠️', pedido: '📎', cerrar: '✅', comentario: '💬', reporte: '📊',
};

const ahoraMza = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return Number(p.hour) * 60 + Number(p.minute);
};
const deNoche = () => { const m = ahoraMza(); return m < 8 * 60 || m >= 22 * 60; };

// "Martín (Admin)" → "Martín". El encargado es "el Gordo" para todos.
const nombre = u => (u.rol === 'encargado_general' ? 'El Gordo' : String(u.nombre || '').replace(/\s*\(.*\)\s*$/, ''));
const corto = (s, n = 60) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const ddmm = f => (f ? String(f).slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '');
const sumarDias = (f, n) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function ids(rol) {
  return (await pool.query('SELECT id FROM usuarios WHERE rol = $1 AND activo', [rol])).rows.map(r => r.id);
}

function mandar(usuarioIds, tema, titulo, texto, url, etiqueta) {
  const a = [...new Set(usuarioIds.filter(Boolean))];
  if (!a.length) return Promise.resolve(0);
  return avisos.enviarAUsuarios(a, { titulo: `${SIMBOLO[tema]} ${titulo}`, texto: corto(texto, 240), url, etiqueta });
}

async function unaVez(clave, fn) {
  const { rowCount } = await pool.query('INSERT INTO avisos_enviados (clave) VALUES ($1) ON CONFLICT DO NOTHING', [clave]);
  if (rowCount) await fn();
}

// Lo que espera el cierre de cada dueño: lo que salió de un reporte, para todos; lo que
// cargó un dueño, solo para él.
async function paraCerrarDe(duenoId) {
  return (await pool.query(`
    SELECT t.id, t.titulo FROM tareas t
    LEFT JOIN LATERAL (SELECT e.usuario_id FROM tarea_eventos e WHERE e.tarea_id = t.id AND e.tipo = 'encargo' ORDER BY e.id LIMIT 1) ec ON true
    WHERE t.estado = 'por_aprobar' AND (t.tipo <> 'encargo' OR ec.usuario_id IS NULL OR ec.usuario_id = $1)
    ORDER BY t.pedido_cierre_at
  `, [duenoId])).rows;
}

async function avisarParaCerrar(duenos) {
  await Promise.all(duenos.map(async id => {
    const lista = await paraCerrarDe(id);
    if (!lista.length) return;
    // La etiqueta es la misma: el aviso nuevo reemplaza al anterior en el celular.
    await mandar([id], 'cerrar', `Para cerrar · ${plural(lista.length, 'tarea espera', 'tareas esperan')} tu cierre`,
      lista.slice(0, 3).map(t => corto(t.titulo, 50)).join(' · ') + (lista.length > 3 ? ` y ${lista.length - 3} más` : ''),
      '/tareas', 'tareas-para-cerrar');
  }));
}

// Un cambio en una tarea. tema:
//   comentario · cualquier mensaje, avance, fecha nueva o foto: al encargado y al que la cargó.
//   encargo    · un dueño le cargó una tarea al encargado.
//   cierre     · el encargado pide cerrarla (o descartarla): a los dueños que la pueden cerrar.
//   pedido     · un dueño pide una foto o algo más: al encargado.
//   devuelta   · un dueño no la aprobó: al encargado.
//   cerrada    · un dueño la cerró: al encargado y al que la cargó.
//   gasto      · un gasto que espera aprobación: a los dueños.
async function cambioEnTarea(t, quien, tema, texto) {
  if (deNoche()) return;
  const [encargados, duenos] = await Promise.all([ids('encargado_general'), ids('admin')]);
  const fuera = arr => arr.filter(id => id !== quien.id);
  const url = `/tareas/${t.id}`;
  const titulo = corto(t.titulo, 50);
  const yo = nombre(quien);

  if (tema === 'cierre') {
    const pueden = t.tipo === 'encargo' && t.cargada_por_id ? [t.cargada_por_id] : duenos;
    return avisarParaCerrar(fuera(pueden));
  }
  if (tema === 'encargo') return mandar(fuera(encargados), 'hoy', `${yo} te cargó una tarea`, `${t.titulo}${texto ? ` · ${texto}` : ''}`, url, `tarea-${t.id}`);
  if (tema === 'pedido') return mandar(fuera(encargados), 'pedido', `${yo} te pidió ${texto.foto ? 'una foto o PDF' : 'algo más'} · ${titulo}`, texto.texto, url, `tarea-${t.id}`);
  if (tema === 'devuelta') return mandar(fuera(encargados), 'vencio', `${yo} no la aprobó · ${titulo}`, texto, url, `tarea-${t.id}`);
  if (tema === 'cerrada') return mandar(fuera([...encargados, t.cargada_por_id]), 'cerrar', `${yo} cerró · ${titulo}`, texto || 'La tarea quedó cerrada.', url, `tarea-${t.id}`);
  if (tema === 'gasto') return mandar(fuera(duenos), 'cerrar', `Gasto para aprobar · ${titulo}`, texto, url, `tarea-${t.id}-gasto`);
  return mandar(fuera([...encargados, t.cargada_por_id]), 'comentario', `${yo} comentó · ${titulo}`, texto, url, `tarea-${t.id}`);
}

// ── Repasos programados ─────────────────────────────────────────────────────
// Se revisan cada diez minutos; cada uno sale una sola vez por día y por persona.
async function abiertasConCargador() {
  return (await pool.query(`
    SELECT t.id, t.titulo, t.tipo, t.estado, t.plazo::text AS plazo, t.fecha::text AS fecha, ec.usuario_id AS cargada_por_id
    FROM tareas t
    LEFT JOIN LATERAL (SELECT e.usuario_id FROM tarea_eventos e WHERE e.tarea_id = t.id AND e.tipo = 'encargo' ORDER BY e.id LIMIT 1) ec ON true
    WHERE t.estado <> 'terminada'
  `)).rows;
}

const lista = ts => ts.slice(0, 3).map(t => corto(t.titulo, 45)).join(', ') + (ts.length > 3 ? ` y ${ts.length - 3} más` : '');

async function revisar() {
  const m = ahoraMza(), hoy = hoyStr();
  if (m < 8 * 60 + 30 || m >= 22 * 60) return;
  const [encargados, duenos, abiertas] = await Promise.all([ids('encargado_general'), ids('admin'), abiertasConCargador()]);
  const delEncargado = abiertas.filter(t => ['nueva', 'en_curso'].includes(t.estado));

  // 8:30 · Tus tareas de hoy, a cada uno lo suyo.
  const vencenHoy = delEncargado.filter(t => t.plazo === hoy);
  const vencidas = delEncargado.filter(t => t.plazo && t.plazo < hoy);
  if (delEncargado.length || abiertas.length) {
    for (const id of encargados) {
      if (!abiertas.length) break;
      await unaVez(`tareas:hoy:${hoy}:${id}`, () => mandar([id], 'hoy', 'Tus tareas de hoy',
        `Tenés ${plural(delEncargado.length, 'abierta', 'abiertas')}.` +
        (vencenHoy.length ? ` Hoy ${vencenHoy.length === 1 ? 'vence' : `vencen ${vencenHoy.length}`}: ${lista(vencenHoy)}.` : '') +
        (vencidas.length ? ` ${plural(vencidas.length, 'está vencida', 'están vencidas')}.` : ''), '/tareas', 'tareas-hoy'));
    }
  }
  for (const id of duenos) {
    const cerrar = await paraCerrarDe(id);
    const cargadas = delEncargado.filter(t => t.cargada_por_id === id);
    if (!cerrar.length && !cargadas.length) continue;
    await unaVez(`tareas:hoy:${hoy}:${id}`, () => mandar([id], 'hoy', 'Tus tareas de hoy',
      [cerrar.length && `${plural(cerrar.length, 'tarea del Gordo espera', 'tareas del Gordo esperan')} que las cierres.`,
       cargadas.length && `${plural(cargadas.length, 'tarea que le cargaste sigue abierta', 'tareas que le cargaste siguen abiertas')}.`]
        .filter(Boolean).join(' '), '/tareas', 'tareas-hoy'));
  }

  // 9:00 · Se venció ayer y sigue abierta: al encargado y al que la cargó, una sola vez.
  if (m >= 9 * 60) {
    const ayer = sumarDias(hoy, -1);
    for (const t of delEncargado.filter(x => x.plazo === ayer)) {
      await unaVez(`tareas:vencio:${t.id}:${t.plazo}`, () => mandar([...encargados, t.cargada_por_id], 'vencio',
        `Se venció · ${corto(t.titulo, 50)}`, `Era para el ${ddmm(t.plazo)} y sigue abierta.`, `/tareas/${t.id}`, `tarea-${t.id}`));
    }
  }

  // 18:00 · Mañana vence.
  if (m >= 18 * 60) {
    const manana = sumarDias(hoy, 1);
    const vencen = delEncargado.filter(t => t.plazo === manana);
    const destinos = new Map();
    for (const t of vencen) for (const id of [...encargados, t.cargada_por_id].filter(Boolean)) destinos.set(id, [...(destinos.get(id) || []), t]);
    for (const [id, ts] of destinos) {
      await unaVez(`tareas:manana:${hoy}:${id}`, () => mandar([id], 'vence',
        ts.length === 1 ? 'Mañana vence una tarea' : `Mañana vencen ${ts.length} tareas`, `${lista(ts)}.`, '/tareas', 'tareas-manana'));
    }
  }
}

module.exports = { SIMBOLO, cambioEnTarea, revisar, nombre };
