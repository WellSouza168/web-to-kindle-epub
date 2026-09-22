/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{html,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        kindle: {
          50: '#f8f9fa',
          100: '#f1f3f5',
          200: '#e9ecef',
          700: '#343a40',
          800: '#212529',
          900: '#121416',
          amber: '#ff9900' // Amazon / Kindle accent
        }
      }
    },
  },
  plugins: [],
}
