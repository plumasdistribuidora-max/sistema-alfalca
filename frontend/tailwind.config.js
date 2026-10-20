/** @type {import('tailwindcss').Config} */

// Paleta del holding (20/10/2026): menú y cabeceras en café con leche #8a705e,
// fondo crema claro #f7f2ea, texto espresso #3b2a24, Coral #e8735a y Taupe #a8998a.
// La escala reemplaza a la violeta de Tailwind para que `text-violet-900`,
// `bg-violet-50`, etc. sigan funcionando en todas las pantallas sin tocarlas.
const espresso = {
  50:  '#fbf8f3',
  100: '#f5efe6',   // Crema
  200: '#e6dccb',
  300: '#cfc2b1',
  400: '#a8998a',   // Taupe
  500: '#8e7f71',
  600: '#75665a',
  700: '#5a4a40',
  800: '#3b2a24',   // Espresso
  900: '#2f211c',
  950: '#221813',
};

// `stone` es el gris de casi todo el texto y los bordes. Se lo entibia hacia el
// espresso con la misma luminosidad de Tailwind, así los contrastes no cambian
// pero no queda un gris frío sobre el fondo crema.
const piedra = {
  50:  '#fbf8f3',
  100: '#f6f1e9',
  200: '#e9e2d7',
  300: '#d8cfc3',
  400: '#ab9f93',
  500: '#7d7066',
  600: '#5c4f46',
  700: '#483c34',
  800: '#2e231e',
  900: '#201814',
  950: '#0f0b09',
};

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        violet: espresso,
        purple: espresso,
        stone:  piedra,
        coral: {
          50:  '#fdf1ee',
          100: '#fbe0d9',
          500: '#e8735a',
          600: '#d45d44',
          700: '#b04a35',
        },
        'ahg-primary':   '#8a705e',   // menú, cabeceras, botones (café con leche)
        'ahg-secondary': '#a08672',   // hover de botones y bordes secundarios
        'ahg-accent':    '#cfc2b1',   // bordes, foco
        'ahg-coral':     '#e8735a',   // lo que se destaca
        'ahg-bg':        '#f7f2ea',   // fondo de pantalla (crema claro)
        'ahg-text':      '#241a16',
      },
      fontFamily: {
        sans:    ['Inter', 'sans-serif'],
        display: ['Nunito', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
