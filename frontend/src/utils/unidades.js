// Unidades en que puede venir un renglón de factura. "u" es la pieza suelta (un paquete,
// una botella); el resto es lo que se compra por peso o por volumen.
export const UNIDADES = [
  { id: 'u',  label: 'unid.', largo: 'unidades' },
  { id: 'kg', label: 'kg',    largo: 'kilos' },
  { id: 'g',  label: 'g',     largo: 'gramos' },
  { id: 'l',  label: 'l',     largo: 'litros' },
  { id: 'ml', label: 'ml',    largo: 'mililitros' },
];

const num = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 });

// "3" para unidades sueltas (como siempre se mostró), "2,5 kg" para lo demás.
export function cantidadConUnidad(cantidad, unidad) {
  const u = UNIDADES.find(x => x.id === unidad);
  const n = num.format(Number(cantidad) || 0);
  return !u || u.id === 'u' ? n : `${n} ${u.label}`;
}

// Cómo se lee el precio: "c/u" o "por kg".
export function precioPor(unidad) {
  const u = UNIDADES.find(x => x.id === unidad);
  return !u || u.id === 'u' ? 'c/u' : `por ${u.label}`;
}
