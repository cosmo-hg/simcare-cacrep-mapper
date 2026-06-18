/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['"Instrument Serif"', 'ui-serif', 'Georgia', 'serif'],
      },
      colors: {
        ink: {
          50: '#fafaf7',
          100: '#f4f3ee',
          200: '#e7e5dc',
          300: '#c9c6b8',
          400: '#8e8a7a',
          500: '#5b5849',
          600: '#3d3b33',
          700: '#27261f',
          800: '#15140f',
          900: '#0a0907',
        },
        accent: {
          DEFAULT: '#1f4d3f',
          soft: '#e6eee9',
        },
      },
      boxShadow: {
        'card': '0 1px 2px rgba(15,14,9,0.04), 0 8px 24px -8px rgba(15,14,9,0.08)',
        'lift': '0 4px 12px rgba(15,14,9,0.06), 0 24px 48px -16px rgba(15,14,9,0.12)',
      },
      transitionTimingFunction: {
        'silk': 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};
