const xlsx     = require('xlsx');
const { getFromR2 } = require('../config/r2');

const R2_KEY    = 'maestros/alfalca/Maestro_Productos_Docenas_ALFALCA.xlsx';
const HOJA      = 'Maestro Docenas';
const HEADER_ROW = 2; // fila 3 del Excel (0-based); equivalente a pandas skiprows=2

// Normalización estricta para matching case-insensitive sin acentos
function normalizar(s) {
  return (s || '').toString()
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.,]+$/, '');
}

let _map    = new Map(); // nombre_normalizado → { docenas, categoria, locales, nombre_original }
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
    // Soporta "Categoría" (con tilde) y "Categoria" (sin tilde) por si el Excel varía
    const categoria  = (row['Categoría'] || row['Categoria'] || '').toString().trim();
    const nombre     = row['Nombre del producto'];
    const docenasRaw = row['DOCENAS (equivalente)'];
    const locales    = row['Locales']               || null;
    const notas      = row['Notas']                 || null;

    if (!nombre) continue;
    const nombreStr = nombre.toString().trim();
    if (!nombreStr) continue;

    // Filtrar filas separadoras de categoría (empiezan con ▸)
    if (categoria.startsWith('▸') || nombreStr.startsWith('▸')) continue;

    const key = normalizar(nombreStr);
    if (!key) continue;

    // DOCENAS: null/undefined/'' → 0 (no cuenta). Número explícito → ese valor.
    let docenas = 0;
    if (docenasRaw !== null && docenasRaw !== undefined && docenasRaw !== '') {
      const parsed = parseFloat(docenasRaw);
      docenas = isNaN(parsed) ? 0 : parsed;
    }

    if (newMap.has(key)) {
      console.warn(`[maestroDocenas] Duplicado normalizado: "${key}" (original: "${nombreStr}") — se mantiene el primero`);
      dupes++;
      continue;
    }

    const entry = { docenas, categoria, locales, notas, nombre_original: nombreStr };
    newMap.set(key, entry);
    newArr.push({ nombre_normalizado: key, nombre_original: nombreStr, docenas, categoria, locales, notas });
  }

  _map    = newMap;
  _arr    = newArr;
  _loaded = true;

  const conDocenas = newArr.filter(e => e.docenas > 0).length;
  console.log(`[maestroDocenas] OK — ${newArr.length} productos (${conDocenas} con docenas > 0, ${dupes} duplicados ignorados)`);
  return { productos: newArr.length, con_docenas: conDocenas, duplicados: dupes };
}

// Retorna el factor de docenas del producto (0 si no está en el maestro o tiene valor vacío)
function getDocenasPorProducto(nombre) {
  const entry = _map.get(normalizar(nombre));
  return entry ? entry.docenas : 0;
}

// Retorna true si el nombre tiene entrada en el maestro (sea docenas > 0 o no)
function isEnMaestro(nombre) {
  return _map.has(normalizar(nombre));
}

function getMaestroArray() { return _arr; }
function isLoaded()        { return _loaded; }

module.exports = { loadMaestro, getDocenasPorProducto, isEnMaestro, getMaestroArray, isLoaded };
