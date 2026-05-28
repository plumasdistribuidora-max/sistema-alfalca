'use strict';

const xlsx          = require('xlsx');
const { getFromR2 } = require('../config/r2');

const R2_KEY     = 'maestros/alfalca/Maestro_Productos_Docenas_ALFALCA.xlsx';
const HOJA       = 'Maestro Docenas';
const HEADER_ROW = 2; // fila 3 del Excel (0-based)

// Normalización canónica — misma función para maestro Y para nombres de venta
function normalizar(s) {
  return (s || '').toString()
    .replace(/ /g, ' ')                       // non-breaking space → espacio normal
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quitar tildes/diacríticos
    .replace(/\s+/g, ' ')
    .trim();
}

let _map    = new Map(); // nombre_normalizado → { docenas, categoria, producto }
let _arr    = [];
let _loaded = false;

async function loadMaestro() {
  const r2Res = await getFromR2(R2_KEY);
  const chunks = [];
  for await (const chunk of r2Res.Body) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);

  const wb = xlsx.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[HOJA];
  if (!ws) throw new Error(`Hoja "${HOJA}" no encontrada en el Excel del maestro`);

  const rows = xlsx.utils.sheet_to_json(ws, { range: HEADER_ROW, defval: null });

  const newMap = new Map();
  const newArr = [];
  let dupes = 0;

  for (const row of rows) {
    // Col 1: Categoría
    const categoria = (row['Categoría'] || row['Categoria'] || '').toString().trim();

    // Col 2: Producto (nombre canónico de la fila)
    const producto = row['Producto'];
    if (!producto || !String(producto).trim()) continue;
    const productoStr = String(producto).trim();

    // Col 3: Variantes separadas por " | "
    const variantesRaw = row['Variantes de nombre (todas matchean)'];
    const variantesStr = variantesRaw ? String(variantesRaw).trim() : productoStr;
    const variantes    = variantesStr.split('|').map(v => v.trim()).filter(Boolean);
    if (variantes.length === 0) variantes.push(productoStr);

    // Col 4: DOCENAS — acepta clave con o sin salto de línea en el header del Excel
    const docenasRaw =
      row['DOCENAS\n(equivalente)'] ??
      row['DOCENAS (equivalente)']  ??
      row['DOCENAS'];
    let docenas = 0;
    if (docenasRaw !== null && docenasRaw !== undefined && docenasRaw !== '') {
      const parsed = parseFloat(docenasRaw);
      docenas = isNaN(parsed) ? 0 : parsed;
    }

    // Col 5: Locales
    const locales = row['Locales'] ? String(row['Locales']).trim() : null;

    // Registrar cada variante en el mapa apuntando al mismo valor de docenas
    for (const variante of variantes) {
      const key = normalizar(variante);
      if (!key) continue;
      if (newMap.has(key)) {
        console.warn(`[maestroDocenas] Variante duplicada: "${key}" (producto: "${productoStr}") — se mantiene la primera`);
        dupes++;
        continue;
      }
      newMap.set(key, { docenas, categoria, producto: productoStr });
    }

    newArr.push({ producto: productoStr, variantes, docenas, categoria, locales });
  }

  _map    = newMap;
  _arr    = newArr;
  _loaded = true;

  const conDocenas = newArr.filter(e => e.docenas > 0).length;
  console.log(
    `[maestroDocenas] OK — ${newArr.length} productos, ${newMap.size} variantes ` +
    `(${conDocenas} con docenas > 0, ${dupes} dupes ignorados)`
  );
  return { productos: newArr.length, variantes: newMap.size, con_docenas: conDocenas, duplicados: dupes };
}

/**
 * Retorna el valor de docenas si el nombre matchea alguna variante del maestro
 * (el valor puede ser 0 para productos que no suman docenas).
 * Retorna null si el nombre no tiene ningún match.
 */
function getDocenasPorProducto(nombre) {
  const entry = _map.get(normalizar(nombre));
  return entry !== undefined ? entry.docenas : null;
}

function isEnMaestro(nombre) {
  return _map.has(normalizar(nombre));
}

function getMaestroArray() { return _arr; }
function isLoaded()        { return _loaded; }

module.exports = { loadMaestro, getDocenasPorProducto, isEnMaestro, getMaestroArray, isLoaded };
