import logoEntreDos from './assets/marcas/entre-dos.png';
import logoKankay   from './assets/marcas/kankay.jpg';
import logoSenzen   from './assets/marcas/senzen-blanco.png';

// Las marcas del grupo. El logo va en su propio recuadro con el fondo con el que
// vino. Senzen es turquesa: se usa una versión blanca sobre negro para que las tres queden parejas.
// Cada una lleva a su dashboard; las que todavía no tienen uno van a "Próximamente" (/marcas/:slug).
export const MARCAS = [
  { slug: 'entre-dos', nombre: 'Entre Dos', rubro: 'Tiendas y cafetería', logo: logoEntreDos, fondo: '#000000', to: '/red' },
  { slug: 'kankay',    nombre: 'Kankay',    rubro: 'Retail',              logo: logoKankay,   fondo: '#000000', to: '/marcas/kankay', proximamente: true },
  { slug: 'senzen',    nombre: 'Senzen',    rubro: 'Hogar',               logo: logoSenzen,   fondo: '#000000', to: '/marcas/senzen', proximamente: true, alto: 68 },
];
