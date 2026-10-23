// Asistente de los dueños: Claude responde preguntas del negocio consultando la base.
//
// Claude no ve la base entera: tiene una sola herramienta, consultar_sql, que corre un
// SELECT adentro de una transacción READ ONLY con el rol asistente_lectura (migración 076),
// con timeout y tope de filas. Aunque escriba algo mal, no puede borrar ni cambiar nada.

const pool = require('../config/db');
const { hoyStr } = require('../utils/fechas');

const Anthropic = require('@anthropic-ai/sdk').default;

const MODELO       = 'claude-opus-5-5';
const MAX_FILAS    = 500;
const MAX_CHARS    = 40000;    // lo que vuelve de cada consulta, para no llenar el contexto
const TIMEOUT_MS   = 15000;
const MAX_VUELTAS  = 20;       // consultas por pregunta, como mucho
// US$ por millón de tokens de Opus 5.5: entrada, escritura y lectura de caché, salida.
const PRECIO = { in: 4, cacheW: 5, cacheR: 0.2, out: 20 };

// Tablas y columnas que Claude no ve (y que el rol tampoco puede leer).
const OCULTAS = ['app_config', 'avisos_suscripciones', 'asistente_preguntas'];
const COLUMNAS_OCULTAS = { usuarios: ['password_hash'] };

let cliente = null;
function claude() {
  if (!process.env.ANTHROPIC_API_KEY) {
    const err = new Error('Falta la clave de la API de Claude (ANTHROPIC_API_KEY en Railway)');
    err.status = 503;
    throw err;
  }
  if (!cliente) cliente = new Anthropic();
  return cliente;
}

// ── Lo que sabe Claude ───────────────────────────────────────────────────────

const REGLAS = `Sos el asistente del Sistema ALFALCA, el sistema de gestión de un grupo de Mendoza (Argentina) con cuatro amigos como dueños. Te preguntan los dueños. Respondés con los datos reales de la base Postgres usando la herramienta consultar_sql. Nunca inventes un número: si no lo podés sacar de la base, decilo.

## Los negocios
- Entre Dos: franquicia de alfajores. Cuatro tiendas: 1 amigorena (Amigorena), 2 nuevedejulio (9 de Julio), 3 peatonal (Peatonal), 4 sheraton (Sheraton). Las ventas salen de los Excel de Fudo.
- Café Peatonal: local 5 cafe_peatonal, cafetería. Comparte dirección con la tienda Peatonal pero es otro local_id. También vende alfajores y suma docenas: incluilo siempre cuando hablen de docenas del grupo.
- Sheraton está a 100 m de Amigorena y se abrió para que nadie más se instale en el hotel (locales.zona_de = 1). Conviene mirarlos juntos como zona.
- Kankay: tienda de cocina (sartenes, ollas). Datos de Dux en kankay_ventas (cada renglón vendido; facturada=false es venta sin factura), kankay_eerr, kankay_stock, kankay_inversiones. Arrancó en agosto de 2026.
- Senzen: distribución de productos de limpieza Carmix en Mendoza, con una vendedora (Pepa). Datos de Dux de Plumas en senzen_facturas, senzen_factura_items, senzen_pedidos, senzen_cobros, senzen_stock; lo de la calle en senzen_comercios, senzen_contactos, senzen_tareas.

## Reglas de las ventas de Fudo (locales 1 a 5)
- Una venta es una fila de ventas_tickets. Solo cuentan las de estado = 'cerrada'. Para filtrar por día usá ventas_tickets.fecha, que ya es la fecha correcta.
- La hora (ventas_tickets.creacion, cerrada, ventas_items.fecha_creacion) está guardada como UTC pero ya es la hora de Mendoza. Para sacar la hora usá EXTRACT(hour FROM creacion AT TIME ZONE 'UTC'). Nunca la conviertas a America/Argentina/Mendoza: resta 3 horas de más.
- Los productos vendidos están en ventas_items, unidos por ventas_items.ticket_id = ventas_tickets.id. Excluí los cancelados: NOT COALESCE(cancelada, false).
- El monto de un renglón es ventas_items.precio_unit, que ya es el total de la línea. No uses precio_total: está inflado (cantidad × total). La venta total sale de ventas_tickets.total.
- Docenas: ventas_items.docenas_equivalentes ya trae las docenas de cada renglón, calculadas con el maestro (productos_catalogo.docenas_por_unidad: NULL = pendiente, 0 = no suma, >0 = suma). Dentro de una misma categoría los productos valen docenas distintas: nunca asumas un valor por categoría.
- Los nombres de producto (producto_nombre_raw) varían entre locales y en el tiempo: buscá con ILIKE y mirá primero qué nombres aparecen antes de sumar. Ejemplo: los doypacks son los productos con 'doypack' en el nombre (DOYPACK, DOYPACK MINIS, Doypack bomba…); fijate si hay alguno que no es del grupo (un té "Doy Pack" de otro proveedor) y aclaralo.
- Las semanas van de lunes a domingo: date_trunc('week', fecha) da el lunes. Para un promedio semanal usá semanas completas y decí cuáles tomaste.
- Fudo puede dar algo distinto porque suma mesas abiertas ("en curso") y ventas cerradas en $0; el sistema no las cuenta.
- Venta neta (sin IVA): lo facturado se divide por 1,21 y lo que va sin factura entra completo. Un ticket es facturado si ventas_tickets.fiscal es true o tiene fila en ventas_fiscales (usá EXISTS, hay tickets con varios comprobantes).
- Personas del Café: ventas_tickets.personas (local 5).
- Medios de pago: ventas_pagos (sin los cancelados).

## Compras y proveedores
- facturas (con facturas_items y pagos_proveedor) son las compras a proveedores, como Entre Dos (la fábrica) y Alimendos. Las compras se analizan por grupo, nunca por local: se compra en 9 de Julio y se usa en Peatonal, así que una caída de compras de una tienda no significa nada.
- A Entre Dos se le compra en docenas para todo el grupo; los bultos (variedades_alfajor.doc_por_bulto) son solo la unidad de compra.

## Otras tablas útiles
- reportes: el reporte de cada turno (respuestas en jsonb). tareas y tarea_eventos: lo que levanta el sistema y resuelve el encargado.
- empleados, valor_hora_empleado, turnos_planificados, local_posiciones: el personal.
- eerr_local, eerr_historico (hasta 2025, tal cual las planillas), eerr_manual: estados de resultados.
- cheques_galicia, getnet_transacciones, cuentas_saldos: la caja.
- dolar_oficial (BNA venta por día), parametros (IPC interanual, etc.).
- El Excel de la red de Entre Dos (FGestión, el ranking contra otros franquiciados) no está en la base: si te lo preguntan, decí que eso no lo tenés.

## Cómo trabajar
- Antes de sumar algo que no conocés bien, mirá unas filas de ejemplo. Preferí pocas consultas que agreguen en la base (SUM, COUNT, GROUP BY) a traer miles de filas.
- Si la pregunta es ambigua (qué período, qué locales), elegí lo más razonable, decilo en una línea y respondé igual. No hagas preguntas de vuelta salvo que sea imposible responder.
- Hoy es la fecha que te paso abajo. "Este mes", "la semana pasada", etc. son en hora de Mendoza.

## Cómo responder
- En castellano rioplatense, corto y directo, como un socio que sabe de números. Primero la respuesta, después el detalle.
- Montos exactos con punto de miles y coma decimal: $ 5.646.160, 105,5 docenas. Nunca abrevies ($ 5,6M no).
- Para comparar locales, una línea por local con un guion adelante. No uses tablas ni títulos con #. Podés usar **negrita** para el número principal.
- Terminá con una línea corta que diga de dónde sale el número (período, qué contaste y qué dejaste afuera).`;

let esquemaCache = null;
async function esquema() {
  if (esquemaCache) return esquemaCache;
  const { rows } = await pool.query(`
    SELECT table_name AS t, column_name AS c, data_type AS d
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position`);
  const tablas = {};
  for (const r of rows) {
    if (OCULTAS.includes(r.t) || COLUMNAS_OCULTAS[r.t]?.includes(r.c)) continue;
    const tipo = { 'character varying': 'text', 'timestamp with time zone': 'timestamptz',
      'timestamp without time zone': 'timestamp', 'USER-DEFINED': 'enum' }[r.d] || r.d;
    (tablas[r.t] ||= []).push(`${r.c} ${tipo}`);
  }
  esquemaCache = Object.entries(tablas).map(([t, cs]) => `${t}(${cs.join(', ')})`).join('\n');
  return esquemaCache;
}

const HERRAMIENTAS = [{
  name: 'consultar_sql',
  description: `Corre una consulta de solo lectura en la base Postgres del sistema y devuelve las filas en JSON. Una sola sentencia SELECT (o WITH … SELECT), sin punto y coma en el medio. Devuelve como mucho ${MAX_FILAS} filas y se corta a los ${TIMEOUT_MS / 1000} segundos: agregá en la base en vez de traer filas sueltas.`,
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      sql:     { type: 'string', description: 'La consulta SELECT.' },
      para_que: { type: 'string', description: 'En pocas palabras, qué querés averiguar con esta consulta. Se le muestra al dueño.' },
    },
    required: ['sql', 'para_que'],
    additionalProperties: false,
  },
}];

// ── La consulta ──────────────────────────────────────────────────────────────

// Lo que se rechaza antes de mandarlo a la base. La seguridad de verdad la dan el rol y la
// transacción READ ONLY; esto es para devolverle a Claude un error claro.
function validarSql(sql) {
  const s = String(sql || '').trim().replace(/;\s*$/, '');
  if (!s) return { error: 'La consulta está vacía.' };
  if (!/^(select|with)\b/i.test(s)) return { error: 'Solo se permiten consultas SELECT o WITH … SELECT.' };
  if (s.includes(';')) return { error: 'Mandá una sola sentencia, sin punto y coma en el medio.' };
  if (/\b(set_config|pg_sleep|pg_read|lo_import|lo_export|dblink|copy)\b/i.test(s)) {
    return { error: 'Esa función no está permitida.' };
  }
  return { sql: s };
}

async function consultar(sqlCrudo) {
  const v = validarSql(sqlCrudo);
  if (v.error) return { error: v.error };

  const c = await pool.connect();
  try {
    await c.query('BEGIN READ ONLY');
    await c.query('SET LOCAL ROLE asistente_lectura');
    await c.query(`SET LOCAL statement_timeout = ${TIMEOUT_MS}`);
    // Protocolo extendido: Postgres no acepta más de una sentencia por mensaje.
    const r = await c.query({ text: `SELECT * FROM (${v.sql}) AS q LIMIT ${MAX_FILAS + 1}`, queryMode: 'extended' });
    const recortado = r.rows.length > MAX_FILAS;
    const filas = recortado ? r.rows.slice(0, MAX_FILAS) : r.rows;
    let json = JSON.stringify(filas);
    let cortado = false;
    if (json.length > MAX_CHARS) { json = json.slice(0, MAX_CHARS); cortado = true; }
    return {
      filas: filas.length,
      texto: json + (recortado ? `\n[Hay más de ${MAX_FILAS} filas: solo van las primeras ${MAX_FILAS}.]` : '')
        + (cortado ? '\n[El resultado se cortó por largo: agregá más en la consulta.]' : ''),
    };
  } catch (err) {
    return { error: err.message };
  } finally {
    await c.query('ROLLBACK').catch(() => {});
    c.release();
  }
}

// ── La conversación ──────────────────────────────────────────────────────────

// historial: [{ rol: 'usuario'|'asistente', texto }] de las preguntas anteriores de esta charla.
async function preguntar({ usuario, pregunta, historial = [] }) {
  const inicio = Date.now();
  const system = [
    { type: 'text', text: `${REGLAS}\n\n## Tablas de la base\n${await esquema()}`, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: `Hoy es ${hoyStr()} (hora de Mendoza). Te pregunta ${usuario.nombre || 'un dueño'}.` },
  ];

  const messages = [];
  for (const h of historial.slice(-10)) {
    const texto = String(h.texto || '').slice(0, 8000);
    if (!texto) continue;
    messages.push({ role: h.rol === 'asistente' ? 'assistant' : 'user', content: texto });
  }
  // La charla tiene que arrancar con el dueño y alternar; si el historial viene raro, se descarta.
  while (messages.length && messages[0].role !== 'user') messages.shift();
  if (messages.length && messages[messages.length - 1].role === 'user') messages.pop();
  messages.push({ role: 'user', content: pregunta });

  const uso = { in: 0, cacheW: 0, cacheR: 0, out: 0 };
  const consultas = [];
  let respuesta = null;
  let error = null;

  try {
    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const r = await claude().beta.messages.create({
        model: MODELO,
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        // Si un filtro de seguridad rechaza la pregunta por error, la responde otro modelo.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system,
        tools: HERRAMIENTAS,
        messages,
      });
      uso.in     += r.usage.input_tokens || 0;
      uso.cacheW += r.usage.cache_creation_input_tokens || 0;
      uso.cacheR += r.usage.cache_read_input_tokens || 0;
      uso.out    += r.usage.output_tokens || 0;

      if (r.stop_reason === 'refusal') { error = 'Claude no quiso responder esa pregunta. Probá decirla de otra forma.'; break; }
      messages.push({ role: 'assistant', content: r.content });
      if (r.stop_reason === 'pause_turn') continue;

      const pedidos = r.content.filter(b => b.type === 'tool_use');
      if (r.stop_reason !== 'tool_use' || !pedidos.length) {
        respuesta = r.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
        if (r.stop_reason === 'max_tokens') respuesta += '\n\n(La respuesta se cortó por larga.)';
        break;
      }

      const resultados = [];
      for (const p of pedidos) {
        const sql = typeof p.input?.sql === 'string' ? p.input.sql : '';
        const res = await consultar(sql);
        consultas.push({ para_que: String(p.input?.para_que || ''), sql, filas: res.filas ?? null, error: res.error || null });
        resultados.push({
          type: 'tool_result',
          tool_use_id: p.id,
          content: res.error ? `Error: ${res.error}` : res.texto,
          ...(res.error ? { is_error: true } : {}),
        });
      }
      messages.push({ role: 'user', content: resultados });
    }
    if (!respuesta && !error) error = 'La pregunta necesitó demasiadas consultas. Probá hacerla más concreta.';
  } catch (err) {
    if (err.status === 503) throw err;
    console.error('[asistente]', err);
    error = err instanceof Anthropic.RateLimitError ? 'Claude está saturado. Probá en un minuto.'
      : /credit balance/i.test(err.message || '') ? 'Se terminaron los créditos de la API de Claude de este mes.'
      : 'No se pudo hablar con Claude. Probá de nuevo.';
  }

  const costo = (uso.in * PRECIO.in + uso.cacheW * PRECIO.cacheW + uso.cacheR * PRECIO.cacheR + uso.out * PRECIO.out) / 1e6;
  const segundos = (Date.now() - inicio) / 1000;
  await pool.query(`
    INSERT INTO asistente_preguntas (usuario_id, pregunta, respuesta, consultas, tokens_in, tokens_cache, tokens_out, costo_usd, segundos, error)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [usuario.id, pregunta, respuesta, JSON.stringify(consultas), uso.in + uso.cacheW, uso.cacheR, uso.out, costo, segundos, error])
    .catch(err => console.warn('[asistente] no se pudo registrar la pregunta:', err.message));

  return { respuesta, error, consultas, costo_usd: Number(costo.toFixed(4)), segundos: Number(segundos.toFixed(1)) };
}

// Lo gastado desde que arrancó y en el mes calendario, en total y por dueño, para mostrarlo
// en el chat. Cada pregunta queda registrada con quién la hizo (asistente_preguntas).
async function gasto() {
  const { rows } = await pool.query(`
    SELECT u.id, u.nombre,
           COUNT(*)::int                                                          AS preguntas,
           COALESCE(SUM(p.costo_usd), 0)::float                                   AS costo_usd,
           COUNT(*) FILTER (WHERE p.creado_en >= date_trunc('month', now()))::int AS preguntas_mes,
           COALESCE(SUM(p.costo_usd) FILTER (WHERE p.creado_en >= date_trunc('month', now())), 0)::float AS costo_mes
    FROM asistente_preguntas p
    LEFT JOIN usuarios u ON u.id = p.usuario_id
    GROUP BY u.id, u.nombre
    ORDER BY costo_usd DESC`);
  const suma = k => rows.reduce((t, r) => t + r[k], 0);
  return {
    preguntas: suma('preguntas'), costo_usd: suma('costo_usd'),
    preguntas_mes: suma('preguntas_mes'), costo_mes: suma('costo_mes'),
    por_persona: rows.map(r => ({ nombre: r.nombre || 'Sin usuario', preguntas: r.preguntas, costo_usd: r.costo_usd, costo_mes: r.costo_mes })),
  };
}

module.exports = { preguntar, gasto, validarSql, consultar };
