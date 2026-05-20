// Normaliza a minúsculas sin acentos para comparación case-insensitive
function norm(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim();
}

function includes(n, sub) { return n.includes(sub); }

/**
 * Calcula las docenas equivalentes de un producto por unidad vendida.
 * Devuelve { docenas: number, esAdicional: boolean, regla: string }
 * La primera regla que matchea gana.
 */
function calcularDocenas(nombre) {
  const n = norm(nombre);

  // Packaging/insumo nunca cuenta
  if (includes(n, 'insumo')) return { docenas: 0, esAdicional: false, regla: 'Insumo (no cuenta)' };

  if (includes(n, 'adicional')) return { docenas: 0, esAdicional: true, regla: 'Adicional' };

  if (includes(n, 'alfajor de arroz')) return { docenas: 0, esAdicional: false, regla: 'Alfajor de arroz (no cuenta)' };

  if (includes(n, 'enamorados') || includes(n, 'vendimia') ||
      includes(n, 'navidena') || includes(n, 'navidena'))
    return { docenas: 0, esAdicional: false, regla: 'Promo estacional' };

  if (includes(n, 'alfajoreate ya 1')) return { docenas: 3.0, esAdicional: false, regla: 'Alfajoreate ya 1 (3 doc)' };
  if (includes(n, 'alfajoreate ya 2')) return { docenas: 4.0, esAdicional: false, regla: 'Alfajoreate ya 2 (4 doc)' };

  // Promos de docenas — orden importa: de mayor especificidad a menor
  if (includes(n, 'promo docena clasica') || includes(n, 'promo docena clasico'))
    return { docenas: 1.0, esAdicional: false, regla: 'Promo docena clásica' };

  if (includes(n, 'promo 2 docenas')) return { docenas: 2.0, esAdicional: false, regla: 'Promo 2 docenas' };

  if (includes(n, 'promo 3 medias docenas')) return { docenas: 1.5, esAdicional: false, regla: 'Promo 3 medias docenas' };

  if ((includes(n, 'promo media docena de conitos') || includes(n, 'promo media docena conitos')))
    return { docenas: 0.5, esAdicional: false, regla: 'Promo media docena conitos' };

  if (includes(n, 'promo media docena clasica') || includes(n, 'promo media docena clasico'))
    return { docenas: 0.5, esAdicional: false, regla: 'Promo media docena clásica' };

  if (includes(n, 'promo 18 alfajores') || (includes(n, 'promo') && includes(n, '18') && !includes(n, 'mini')))
    return { docenas: 1.5, esAdicional: false, regla: 'Promo 18 alfajores' };

  if (includes(n, 'promo 9 alfajores') || (includes(n, 'promo') && includes(n, '9') && !includes(n, 'mini')))
    return { docenas: 0.75, esAdicional: false, regla: 'Promo 9 alfajores' };

  if (includes(n, 'promo 12 mini')) return { docenas: 1.0, esAdicional: false, regla: 'Promo 12 mini' };

  if (includes(n, 'promo 3 minis') || includes(n, 'promo 3 mini'))
    return { docenas: 0.25, esAdicional: false, regla: 'Promo 3 minis' };

  // "promo clásica" genérica: sin "media" y sin "docena"
  if (includes(n, 'promo clasica') && !includes(n, 'media') && !includes(n, 'docena'))
    return { docenas: 0.5, esAdicional: false, regla: 'Promo clásica (6 alf)' };

  if (includes(n, 'doypack mini')) return { docenas: 1.5, esAdicional: false, regla: 'Doypack mini (18 minis)' };

  if (includes(n, 'mini alfajor') || includes(n, 'alfajor mini'))
    return { docenas: 1 / 12, esAdicional: false, regla: 'Mini alfajor (1/12)' };

  if (includes(n, 'galletas banadas') && includes(n, 'x 6'))
    return { docenas: 15 / 12, esAdicional: false, regla: 'Galletas bañadas x6 (15/12)' };

  if (includes(n, 'galletitas chips chocolate'))
    return { docenas: 15 / 12, esAdicional: false, regla: 'Galletitas chips chocolate (15/12)' };

  if (includes(n, 'galletitas arandanos') || includes(n, 'galletitas arandano'))
    return { docenas: 15 / 12, esAdicional: false, regla: 'Galletitas arándanos (15/12)' };

  // Conito suelto (sin promo)
  if (includes(n, 'conito') && !includes(n, 'promo'))
    return { docenas: 1 / 12, esAdicional: false, regla: 'Conito (1/12)' };

  if (includes(n, 'black edition x 4') || (includes(n, 'alfajor') && includes(n, 'x 4 unidades')))
    return { docenas: 4 / 12, esAdicional: false, regla: 'Black edition x4 (4/12)' };

  if (includes(n, 'alfajor') && includes(n, 'caja x 2'))
    return { docenas: 2 / 12, esAdicional: false, regla: 'Alfajor caja x2 (2/12)' };

  // Alfajor unitario genérico (sin mini, sin promo, sin adicional, sin arroz)
  if (includes(n, 'alfajor') &&
      !includes(n, 'mini') && !includes(n, 'promo') &&
      !includes(n, 'adicional') && !includes(n, 'arroz'))
    return { docenas: 1 / 12, esAdicional: false, regla: 'Alfajor unitario (1/12)' };

  return { docenas: 0, esAdicional: false, regla: 'Sin match' };
}

module.exports = { calcularDocenas };
