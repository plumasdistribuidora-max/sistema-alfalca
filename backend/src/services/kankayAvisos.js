// Avisos de Kankay en el celular de los dueños. Cada dueño elige cuáles recibe.
//
// - ventas:       cada vez que se sube un Excel.
// - eerr:         cuando alguien carga o cambia el estado de resultados.
// - equilibrio:   el día que el mes pasa el punto de equilibrio, y el 20 si a este ritmo no llega.
// - cierre:       el día 1, el resumen del mes que terminó.
// - recordatorio: si pasan 7 días sin que nadie suba el Excel de ventas.

const pool   = require('../config/db');
const avisos = require('./avisos');
const kankay = require('./kankay');

const TEMAS = [
  { tema: 'kankay_ventas',       titulo: 'Se cargaron ventas',              porDefecto: true,
    detalle: 'Cada vez que alguien sube un Excel. Dice qué días entraron, cuánto se vendió y cómo venimos contra el mes anterior.' },
  { tema: 'kankay_eerr',         titulo: 'Estado de resultados terminado',  porDefecto: true,
    detalle: 'Cuando alguien toca "Terminé, avisar" en un mes del estado de resultados. Dice qué mes y cómo quedó el resultado. Te llega también si lo terminaste vos.' },
  { tema: 'kankay_equilibrio',   titulo: 'Punto de equilibrio',             porDefecto: true,
    detalle: 'El día que el mes pasa el punto de equilibrio. Y el 20 de cada mes, si a este ritmo no llega, cuánto falta.' },
  { tema: 'kankay_cierre',       titulo: 'Cierre del mes',                  porDefecto: true,
    detalle: 'El primer día del mes siguiente, con el resumen del mes que terminó.' },
  { tema: 'kankay_recordatorio', titulo: 'Falta subir ventas',              porDefecto: false,
    detalle: 'Si pasan 7 días sin que nadie suba el Excel de ventas.' },
];
const DEF = Object.fromEntries(TEMAS.map(t => [t.tema, t]));

const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mesN = p => MES[Number(p.slice(5)) - 1];
const fmt  = n => `${n < 0 ? '− ' : ''}$ ${Math.round(Math.abs(n)).toLocaleString('es-AR')}`;
const pc   = n => `${(n * 100).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
const chg  = v => `${v >= 0 ? '▲' : '▼'} ${pc(Math.abs(v))}`;

async function preferencias(usuarioId) {
  const { rows } = await pool.query('SELECT tema, activo FROM avisos_preferencias WHERE usuario_id = $1', [usuarioId]);
  const p = Object.fromEntries(rows.map(r => [r.tema, r.activo]));
  return TEMAS.map(t => ({ ...t, activo: p[t.tema] ?? t.porDefecto }));
}

async function guardarPreferencia(usuarioId, tema, activo) {
  if (!DEF[tema]) throw new Error('Aviso desconocido');
  await pool.query(`
    INSERT INTO avisos_preferencias (usuario_id, tema, activo) VALUES ($1,$2,$3)
    ON CONFLICT (usuario_id, tema) DO UPDATE SET activo = EXCLUDED.activo
  `, [usuarioId, tema, !!activo]);
}

// Los dueños que tienen ese aviso prendido.
async function destinatarios(tema, excluir) {
  const { rows } = await pool.query(`
    SELECT u.id FROM usuarios u
    LEFT JOIN avisos_preferencias p ON p.usuario_id = u.id AND p.tema = $1
    WHERE u.rol = 'admin' AND u.activo = true AND COALESCE(p.activo, $2) AND ($3::int IS NULL OR u.id <> $3)
  `, [tema, DEF[tema].porDefecto, excluir || null]);
  return rows.map(r => r.id);
}

async function mandar(tema, texto, { excluir, url = '/marcas/kankay' } = {}) {
  const ids = await destinatarios(tema, excluir);
  return avisos.enviarAUsuarios(ids, { titulo: `Kankay · ${DEF[tema].titulo}`, texto, url, etiqueta: tema });
}

// Una sola vez por clave (cierre de cada mes, equilibrio de cada mes, etc.).
async function unaVez(clave, fn) {
  const { rowCount } = await pool.query('INSERT INTO avisos_enviados (clave) VALUES ($1) ON CONFLICT DO NOTHING', [clave]);
  if (rowCount) await fn();
}

const fechaCorta = iso => `${Number(iso.slice(8))} de ${mesN(iso.slice(0, 7))}`;

// Después de un import: aviso de ventas y, si corresponde, el de equilibrio.
async function trasImport(imp, usuarioId) {
  const D = await kankay.datos();
  const p = imp.hasta.slice(0, 7), M = D.meses[p];
  const meses = Object.keys(D.meses).sort(), prev = D.meses[meses[meses.indexOf(p) - 1]];
  let cmp = '';
  if (M && prev) {
    const dia = Number(M.hasta.slice(8));
    const completo = dia >= kankay.ultimoDia(p);
    const P = completo ? prev : prev.hasta1_[dia];
    if (P && P.tot) cmp = ` ${mesN(p)[0].toUpperCase() + mesN(p).slice(1)} va ${chg(M.tot / P.tot - 1)} contra ${completo ? mesN(meses[meses.indexOf(p) - 1]) : 'los mismos días del mes anterior'}.`;
  }
  const rango = imp.desde === imp.hasta ? `del ${fechaCorta(imp.desde)}` : `del ${fechaCorta(imp.desde)} al ${fechaCorta(imp.hasta)}`;
  const sinV = imp.diasSinVentas
    ? ` ${imp.diasSinVentas === 1 ? `El ${fechaCorta(imp.sinVentasDesde)} no hubo ventas` : `Del ${fechaCorta(imp.sinVentasDesde)} al ${fechaCorta(imp.hasta)} no hubo ventas`}.` : '';
  await mandar('kankay_ventas', imp.renglones
    ? `Se cargaron las ventas ${rango}: ${fmt(imp.total)} con IVA en ${imp.ventas} ventas.${sinV}${cmp}`
    : `Se cargó Kankay ${rango}: no hubo ventas.${cmp}`);

  for (const mes of imp.meses) {
    if (!D.meses[mes]) continue;
    const r = await kankay.resultadoMes(mes, D);
    if (r?.pe && D.meses[mes].neto >= r.pe) {
      await unaVez(`kankay:equilibrio:${mes}`, () => mandar('kankay_equilibrio',
        `${mesN(mes)[0].toUpperCase() + mesN(mes).slice(1)} pasó el punto de equilibrio${r.estimado ? ' (estimado)' : ''}: lleva ${fmt(D.meses[mes].neto)} sin IVA y hacían falta ${fmt(r.pe)}.`));
    }
  }
}

// Cuando alguien da por terminado el estado de resultados de un mes. Le llega también a
// quien lo terminó, como confirmación.
async function eerrTerminado(periodo, nombre) {
  const D = await kankay.datos();
  const r = D.vacio ? null : await kankay.resultadoMes(periodo, D);
  const M = D.meses?.[periodo];
  const fin = r?.res != null
    ? ` Resultado operativo: ${fmt(r.ro)} (${pc(r.ro / M.neto)} de la venta). Resultado del mes: ${fmt(r.res)}.`
    : ' Todavía faltan gastos para tener el resultado.';
  return mandar('kankay_eerr', `${nombre || 'Alguien'} terminó el estado de resultados de ${mesN(periodo)}.${fin}`);
}

// Lo que se revisa una vez por hora: cierre del mes, el 20 y el recordatorio.
async function revisarProgramados() {
  const ahora = new Date();
  if (ahora.getHours() < 9) return;
  const D = await kankay.datos();
  if (D.vacio) return;
  const hoy = D.hoy, p = hoy.slice(0, 7), dia = Number(hoy.slice(8));

  // Día 1: cierre del mes anterior.
  if (dia === 1) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
    const ant = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const M = D.meses[ant];
    if (M) await unaVez(`kankay:cierre:${ant}`, async () => {
      const meses = Object.keys(D.meses).sort(), prev = D.meses[meses[meses.indexOf(ant) - 1]];
      const r = await kankay.resultadoMes(ant, D);
      await mandar('kankay_cierre',
        `${mesN(ant)[0].toUpperCase() + mesN(ant).slice(1)} cerró en ${fmt(M.tot)} con IVA${prev ? ` (${chg(M.tot / prev.tot - 1)} contra ${mesN(meses[meses.indexOf(ant) - 1])})` : ''}. ` +
        `Margen bruto ${pc((M.neto - M.cmv) / M.neto)}.${r?.res != null ? ` Resultado del mes: ${fmt(r.res)}.` : ' Faltan cargar los gastos.'}`);
    });
  }

  // Día 20: si a este ritmo no llega al equilibrio.
  if (dia >= 20 && D.meses[p]) {
    const M = D.meses[p], r = await kankay.resultadoMes(p, D);
    const diasCon = Number(M.hasta.slice(8));
    const proy = M.neto / diasCon * kankay.ultimoDia(p);
    if (r?.pe && M.neto < r.pe && proy < r.pe) {
      await unaVez(`kankay:eq20:${p}`, () => mandar('kankay_equilibrio',
        `A este ritmo ${mesN(p)} cierra en ${fmt(proy)} sin IVA y el equilibrio${r.estimado ? ' estimado' : ''} es ${fmt(r.pe)}: faltarían ${fmt(r.pe - proy)}.`));
    }
  }

  // Recordatorio: 7 días sin subir el Excel.
  const { rows: [u] } = await pool.query('SELECT id, subido_en FROM kankay_imports ORDER BY subido_en DESC LIMIT 1');
  if (u && ahora - new Date(u.subido_en) > 7 * 24 * 3600 * 1000) {
    await unaVez(`kankay:recordatorio:${u.id}`, () => mandar('kankay_recordatorio',
      `Hace 7 días que no se sube el Excel de ventas de Kankay. El último llega hasta el ${fechaCorta(D.total.hasta)}.`, { url: '/marcas/kankay/importar' }));
  }
}

module.exports = { TEMAS, preferencias, guardarPreferencia, trasImport, eerrTerminado, revisarProgramados };
