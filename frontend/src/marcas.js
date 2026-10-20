import logoEntreDos from './assets/marcas/entre-dos.png';
import logoKankay   from './assets/marcas/kankay.jpg';
import logoSenzen   from './assets/marcas/senzen-blanco.png';

// Las marcas del grupo. Los logos son blancos sobre negro; el recuadro va del gris
// de la barra lateral y la imagen se mezcla en modo "screen", así el negro toma ese
// gris y las tres marcas combinan con el menú. Senzen es turquesa: se usa una
// versión blanca para que las tres queden parejas.
// Cada una lleva a su dashboard; las que todavía no tienen uno van a "Próximamente" (/marcas/:slug).
// Kankay tiene su dashboard con las ventas de Dux y el estado de resultados (/marcas/kankay).
export const MARCAS = [
  { slug: 'entre-dos', nombre: 'Entre Dos', rubro: 'Tiendas y cafetería', logo: logoEntreDos, fondo: '#55585c', to: '/red' },
  { slug: 'kankay',    nombre: 'Kankay',    rubro: 'Retail',              logo: logoKankay,   fondo: '#55585c', to: '/marcas/kankay', cta: 'Ver dashboard →' },
  { slug: 'senzen',    nombre: 'Senzen',    rubro: 'Hogar',               logo: logoSenzen,   fondo: '#55585c', to: '/marcas/senzen', proximamente: true, alto: 68 },
];
