'use strict';

const pool = require('../config/db');

// Normalización canónica del nombre de un producto.
// Es la única función de normalización del sistema: la usa tanto la importación
// de ventas para armar la clave del catálogo como cualquier búsqueda posterior.
// Antes había dos variantes distintas y eso generaba filas duplicadas para el
// mismo producto cuando el POS mandaba espacios de más.
function normalizar(s) {
  return (s || '').toString()
    .replace(/ /g, ' ')                    // espacio duro → espacio normal
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // quitar tildes
    .replace(/\s+/g, ' ')
    .trim();
}

// Cache en memoria: nombre_normalizado → { id, docenas, definido }
// docenas es null cuando el producto todavía no fue definido.
let _map    = new Map();
let _loaded = false;

async function loadMaestro() {
  const { rows } = await pool.query(`
    SELECT id, nombre_normalizado, nombre_display, docenas_por_unidad
    FROM productos_catalogo
  `);

  const nuevo = new Map();
  for (const r of rows) {
    const definido = r.docenas_por_unidad !== null;
    nuevo.set(normalizar(r.nombre_normalizado), {
      id:       r.id,
      docenas:  definido ? parseFloat(r.docenas_por_unidad) : null,
      definido,
    });
  }

  _map    = nuevo;
  _loaded = true;

  const pendientes = rows.filter(r => r.docenas_por_unidad === null).length;
  console.log(
    `[maestroDocenas] ${rows.length} productos en catálogo ` +
    `(${rows.length - pendientes} definidos, ${pendientes} pendientes)`
  );
  return { productos: rows.length, definidos: rows.length - pendientes, pendientes };
}

/**
 * Docenas por unidad de un producto.
 * Devuelve el número si está definido, o null si el producto no existe en el
 * catálogo o existe pero todavía no fue definido. Nunca devuelve 0 por defecto:
 * un 0 acá significa "definido explícitamente como que no suma".
 */
function getDocenasPorProducto(nombre) {
  const e = _map.get(normalizar(nombre));
  return e && e.definido ? e.docenas : null;
}

/** true si el producto ya tiene un valor de docenas definido (incluye el 0). */
function estaDefinido(nombre) {
  const e = _map.get(normalizar(nombre));
  return !!(e && e.definido);
}

/** true si el producto existe en el catálogo, esté definido o no. */
function existeEnCatalogo(nombre) {
  return _map.has(normalizar(nombre));
}

/** Actualiza el cache para un producto sin releer todo el catálogo. */
function setCache(nombreNormalizado, id, docenas) {
  _map.set(normalizar(nombreNormalizado), {
    id,
    docenas:  docenas === null || docenas === undefined ? null : parseFloat(docenas),
    definido: docenas !== null && docenas !== undefined,
  });
}

function isLoaded() { return _loaded; }

module.exports = {
  normalizar,
  loadMaestro,
  getDocenasPorProducto,
  estaDefinido,
  existeEnCatalogo,
  setCache,
  isLoaded,
};
