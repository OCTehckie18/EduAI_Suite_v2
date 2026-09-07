/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        edu: {
          blue: {
            dark: "#264796",
            mid: "#284b9e",
            light: "#2a4fa7",
          },
          gold: {
            dark: "#d0ae61",
            light: "#ddb867",
          }
        }
      },
      backgroundImage: {
        'gradient-premium': 'linear-gradient(135deg, #264796 0%, #2a4fa7 100%)',
        'gradient-gold': 'linear-gradient(135deg, #d0ae61 0%, #ddb867 100%)',
      },
      backdropBlur: {
        xs: '2px',
      }
    },
  },
  plugins: [],
}
