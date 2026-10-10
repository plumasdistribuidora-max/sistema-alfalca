// Avisos en el celular (web push).
//
// No depende de nadie más: el mismo sistema los manda, gratis. Las claves con las que
// se firman se generan solas la primera vez y quedan en la base, así no hay que
// configurar nada en Railway.

const webpush = require('web-push');
const pool    = require('../config/db');

let claves = null;

async function clavesVapid() {
  if (claves) return claves;
  const { rows } = await pool.query(
    `SELECT clave, valor FROM app_config WHERE clave IN ('vapid_publica', 'vapid_privada')`
  );
  const m = Object.fromEntries(rows.map(r => [r.clave, r.valor]));
  if (m.vapid_publica && m.vapid_privada) {
    claves = { publica: m.vapid_publica, privada: m.vapid_privada };
  } else {
    const nuevas = webpush.generateVAPIDKeys();
    // Si dos procesos arrancan a la vez, gana el primero que escribió: el segundo lee esas.
    await pool.query(`
      INSERT INTO app_config (clave, valor) VALUES ('vapid_publica', $1), ('vapid_privada', $2)
      ON CONFLICT (clave) DO NOTHING
    `, [nuevas.publicKey, nuevas.privateKey]);
    claves = null;
    return clavesVapid();
  }
  webpush.setVapidDetails('mailto:plumasdistribuidora@gmail.com', claves.publica, claves.privada);
  return claves;
}

// payload: { titulo, texto, url, etiqueta }. La etiqueta hace que un aviso nuevo del
// mismo tema reemplace al anterior en vez de apilarse.
async function enviarAUsuarios(usuarioIds, payload) {
  if (!usuarioIds.length) return 0;
  await clavesVapid();
  const { rows } = await pool.query(
    'SELECT id, endpoint, p256dh, auth FROM avisos_suscripciones WHERE usuario_id = ANY($1)',
    [usuarioIds]
  );
  const cuerpo = JSON.stringify(payload);
  let enviados = 0;
  await Promise.all(rows.map(async s => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        cuerpo,
        { TTL: 60 * 60 * 24 * 3 }
      );
      enviados++;
    } catch (err) {
      // 404/410: el aparato dio de baja el permiso o borró la app. Se limpia.
      if (err.statusCode === 404 || err.statusCode === 410) {
        await pool.query('DELETE FROM avisos_suscripciones WHERE id = $1', [s.id]);
      } else {
        console.warn('[avisos] no se pudo mandar a', s.id, err.statusCode || err.message);
      }
    }
  }));
  return enviados;
}

async function idsDeRol(rol) {
  const { rows } = await pool.query('SELECT id FROM usuarios WHERE rol = $1 AND activo = true', [rol]);
  return rows.map(r => r.id);
}

const aDuenos     = payload => idsDeRol('admin').then(ids => enviarAUsuarios(ids, payload));
const aEncargados = payload => idsDeRol('encargado_general').then(ids => enviarAUsuarios(ids, payload));

// Para no frenar nunca lo que lo disparó: un aviso que falla no puede romper un import.
function enSegundoPlano(promesa, contexto) {
  promesa.catch(err => console.warn(`[avisos] ${contexto}:`, err.message));
}

module.exports = { clavesVapid, enviarAUsuarios, aDuenos, aEncargados, enSegundoPlano };
