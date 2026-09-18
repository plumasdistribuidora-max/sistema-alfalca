/** @type {import('tailwindcss').Config} */

// Gris mate del holding (inspirado en pinturas mate de autos: Daytona, Nardo, Chalk).
// La escala reemplaza a la violeta de Tailwind para que `text-violet-900`,
// `bg-violet-50`, etc. sigan funcionando en todas las pantallas sin tocarlas.
const grisMate = {
  50:  '#f4f4f2',
  100: '#ecebe7',
  200: '#dcdbd6',
  300: '#c3c2bd',
  400: '#9a9c9e',
  500: '#7d8085',
  600: '#6b6e72',
  700: '#55585c',
  800: '#45484c',
  900: '#35383b',
  950: '#26282a',
};

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        violet: grisMate,
        purple: grisMate,
        'ahg-primary':   '#45484c',   // menú, cabeceras, botones
        'ahg-secondary': '#6b6e72',   // hover, texto secundario (Nardo)
        'ahg-accent':    '#c3c2bd',   // bordes, foco
        'ahg-bronce':    '#a8834a',   // único acento: badges, logo
        'ahg-bg':        '#ecebe7',   // fondo de pantalla (Chalk)
        'ahg-text':      '#1f2022',
      },
      fontFamily: {
        sans:    ['Inter', 'sans-serif'],
        display: ['Nunito', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
