/** @type {import('tailwindcss').Config} */

// Paleta del holding "gris mate de autos" (20/10/2026), inspirada en las pinturas
// mate de los autos deportivos: barra y cabeceras #55585c, fondo Chalk #ecebe7,
// texto #1f2022 y un acento salvia #9aa08a. La escala reemplaza a la violeta de
// Tailwind para que `text-violet-900`, `bg-violet-50`, etc. sigan funcionando en
// todas las pantallas sin tocarlas.
const grisMate = {
  50:  '#f4f4f2',
  100: '#ecebe7',   // Chalk
  200: '#dcdbd6',
  300: '#c3c2bd',
  400: '#9a9c9e',
  500: '#7d8085',
  600: '#6b6e72',   // Nardo
  700: '#55585c',
  800: '#45484c',   // Daytona
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
        'ahg-primary':   '#55585c',   // menú, cabeceras, botones
        'ahg-secondary': '#66696d',   // hover de botones y bordes secundarios
        'ahg-accent':    '#c3c2bd',   // bordes, foco
        'ahg-salvia':    '#9aa08a',   // acento
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
