/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'ahg-primary':   '#4C1D95',
        'ahg-secondary': '#7C3AED',
        'ahg-accent':    '#C4B5FD',
        'ahg-bg':        '#FAFAF7',
        'ahg-text':      '#1F2937',
      },
      fontFamily: {
        sans:    ['Inter', 'sans-serif'],
        display: ['Nunito', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
