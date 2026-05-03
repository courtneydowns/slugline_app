/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{jsx,js,html}', './index.html'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        screenplay: ['"Courier Prime"', 'Courier New', 'monospace'],
        ui: ['"DM Sans"', 'system-ui', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'serif'],
      },
      colors: {
        amber: {
          screenplay: '#C8963E',
        }
      }
    }
  },
  plugins: []
}
