const express = require('express');
const pool    = require('../config/db');

// Estado de resultados cargado a mano, por marca y por mes. Lo usa Kankay mientras
// no tenga de dónde sacar los números; las líneas las arma el dueño en la pantalla.
const router = express.Router();

const MARCAS  = ['kankay'];
const GRUPOS  = ['ingresos', 'deducciones', 'cmv', 'gastos', 'otros', 'financieros'];
const PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/;

// Las líneas con las que arranca un mes que nunca se cargó, si no hay uno anterior del que copiarlas.
const PLANTILLA = [
  ['ingresos',    'Ventas en local'],
  ['ingresos',    'Ventas online'],
  ['deducciones', 'Descuentos y devoluciones'],
  ['deducciones', 'Comisiones de tarjetas y plataformas'],
  ['cmv',         'Costo de la mercadería vendida'],
  ['cmv',         'Fletes de compra'],
  ['gastos',      'Sueldos y cargas sociales'],
  ['gastos',      'Alquiler y expensas'],
  ['gastos',      'Servicios (luz, agua, internet)'],
  ['gastos',      'Marketing y publicidad'],
  ['gastos',      'Envíos y logística'],
  ['gastos',      'Honorarios (contador, etc.)'],
  ['gastos',      'Sistemas y software'],
  ['gastos',      'Otros gastos'],
  ['financieros', 'Ingresos brutos'],
  ['financieros', 'Impuesto al cheque'],
  ['financieros', 'Intereses y gastos bancarios'],
];

const nuevoId = () => Math.random().toString(36).slice(2, 10);

function validar(req, res) {
  const { marca, periodo } = req.params;
  if (!MARCAS.includes(marca)) { res.status(404).json({ ok: false, error: 'Marca sin estado de resultados' }); return false; }
  if (periodo !== undefined && !PERIODO.test(periodo)) { res.status(400).json({ ok: false, error: 'Período inválido (YYYY-MM)' }); return false; }
  return true;
}

// Los meses que ya tienen algo cargado.
router.get('/:marca', async (req, res) => {
  if (!validar(req, res)) return;
  try {
    const { rows } = await pool.query(
      'SELECT periodo, actualizado_en FROM eerr_manual WHERE marca = $1 ORDER BY periodo DESC',
      [req.params.marca]
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error al obtener los meses' });
  }
});

// Un mes. Si nunca se cargó, trae los renglones del último mes anterior (con los
// montos en blanco) o la plantilla, y avisa que todavía no está guardado.
router.get('/:marca/:periodo', async (req, res) => {
  if (!validar(req, res)) return;
  const { marca, periodo } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT lineas, actualizado_en FROM eerr_manual WHERE marca = $1 AND periodo = $2',
      [marca, periodo]
    );
    if (rows.length) return res.json({ ok: true, data: { periodo, guardado: true, ...rows[0] } });

    const { rows: prev } = await pool.query(
      'SELECT lineas FROM eerr_manual WHERE marca = $1 AND periodo < $2 ORDER BY periodo DESC LIMIT 1',
      [marca, periodo]
    );
    const lineas = prev.length
      ? prev[0].lineas.map(l => ({ id: nuevoId(), grupo: l.grupo, nombre: l.nombre, monto: null }))
      : PLANTILLA.map(([grupo, nombre]) => ({ id: nuevoId(), grupo, nombre, monto: null }));
    res.json({ ok: true, data: { periodo, guardado: false, lineas, actualizado_en: null } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error al obtener el mes' });
  }
});

router.put('/:marca/:periodo', async (req, res) => {
  if (!validar(req, res)) return;
  const { marca, periodo } = req.params;
  const { lineas } = req.body || {};
  if (!Array.isArray(lineas) || lineas.length > 300)
    return res.status(400).json({ ok: false, error: 'lineas tiene que ser una lista' });

  const limpias = [];
  for (const l of lineas) {
    if (!GRUPOS.includes(l?.grupo)) return res.status(400).json({ ok: false, error: `Grupo inválido: ${l?.grupo}` });
    const monto = l.monto === null || l.monto === '' || l.monto === undefined ? null : Number(l.monto);
    if (monto !== null && !Number.isFinite(monto)) return res.status(400).json({ ok: false, error: `Monto inválido en "${l.nombre}"` });
    limpias.push({ id: String(l.id || nuevoId()).slice(0, 20), grupo: l.grupo, nombre: String(l.nombre || '').slice(0, 120), monto });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO eerr_manual (marca, periodo, lineas, actualizado_por)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (marca, periodo) DO UPDATE
         SET lineas = EXCLUDED.lineas, actualizado_en = NOW(), actualizado_por = EXCLUDED.actualizado_por
       RETURNING actualizado_en`,
      [marca, periodo, JSON.stringify(limpias), req.user?.id || null]
    );
    res.json({ ok: true, data: { periodo, guardado: true, actualizado_en: rows[0].actualizado_en } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error al guardar' });
  }
});

module.exports = router;
