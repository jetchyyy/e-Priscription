/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#effcf9', 100: '#d3f8ef', 200: '#a8f0df', 300: '#72e2cb', 400: '#3dcbb2',
          500: '#1fb099', 600: '#148e7d', 700: '#137265', 800: '#145a52', 900: '#144b45', 950: '#062d2a',
        },
        ink: {
          50: '#f6f8fb', 100: '#eceff5', 200: '#d9dfea', 300: '#b8c2d4', 400: '#8896ae',
          500: '#64738c', 600: '#4b5870', 700: '#394459', 800: '#242e42', 900: '#121a2b', 950: '#0a101c',
        },
        gold: { 300: '#fbd77a', 400: '#f7c455', 500: '#f0aa24' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'Inter', 'ui-sans-serif', 'sans-serif'],
        rx: ['Fraunces', 'Georgia', 'serif'],
        script: ['Caveat', 'cursive'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(10 16 28 / .04), 0 8px 24px -8px rgb(10 16 28 / .08)',
        glow: '0 8px 24px -6px rgb(20 142 125 / .45)',
        paper: '0 2px 4px rgb(10 16 28 / .05), 0 24px 60px -20px rgb(10 16 28 / .25)',
      },
      keyframes: {
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'slide-up': { from: { opacity: 0, transform: 'translateY(24px)' }, to: { opacity: 1, transform: 'none' } },
        'pop': { '0%': { transform: 'scale(.9)', opacity: 0 }, '60%': { transform: 'scale(1.03)' }, '100%': { transform: 'scale(1)', opacity: 1 } },
        'float': { '0%,100%': { transform: 'translateY(0) rotate(-3deg)' }, '50%': { transform: 'translateY(-10px) rotate(-3deg)' } },
        'ring': { '0%': { transform: 'scale(.9)', opacity: 0.6 }, '100%': { transform: 'scale(1.5)', opacity: 0 } },
        'unlock': { from: { filter: 'blur(14px)', opacity: 0.4 }, to: { filter: 'blur(0)', opacity: 1 } },
      },
      animation: {
        'fade-in': 'fade-in .25s ease-out both',
        'slide-up': 'slide-up .35s cubic-bezier(.2,.8,.2,1) both',
        'pop': 'pop .45s cubic-bezier(.2,.8,.2,1) both',
        'float': 'float 6s ease-in-out infinite',
        'ring': 'ring 1.8s ease-out infinite',
        'unlock': 'unlock .9s ease-out both',
      },
    },
  },
  plugins: [],
};
