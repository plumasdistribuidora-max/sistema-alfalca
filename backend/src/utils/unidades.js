'use strict';

// Unidades en que puede venir un renglón de factura. Tienen que coincidir con el CHECK
// de facturas_items.unidad y con la lista del frontend (utils/unidades.js).
const UNIDADES = ['u', 'kg', 'g', 'l', 'ml'];

// Lo que no está en la lista se guarda como unidad suelta, que es lo que siempre fue.
const unidadValida = u => (UNIDADES.includes(u) ? u : 'u');

module.exports = { UNIDADES, unidadValida };
