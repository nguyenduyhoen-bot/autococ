/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cat: {
          950: '#07090e',
          900: '#0d1117',
          850: '#131922',
          800: '#161e2b',
          accent: '#10b981',
          cyan: '#06b6d4',
          purple: '#8b5cf6'
        }
      }
    },
  },
  plugins: [],
}

