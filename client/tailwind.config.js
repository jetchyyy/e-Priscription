/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ody: {
          navy: '#152839',
          'navy-deep': '#0d1b28',
          orange: '#FF6F07',
          'orange-deep': '#e05f00',
          warm: '#F9F8F3',
          white: '#FFFFFF',
          sand: '#ECE7DE',
          'sand-deep': '#ddd5c7',
          mist: '#DCE1E8',
          'mist-deep': '#c8d0db',
          ember: '#B8470A',
          slate: '#45546A',
          harbor: '#5F6A7C',
        },
        brand: {
          50: '#f9f8f3', 100: '#ece7de', 200: '#dce1e8', 300: '#8896ae', 400: '#5F6A7C',
          500: '#45546A', 600: '#152839', 700: '#152839', 800: '#0d1b28', 900: '#0d1b28', 950: '#060c12',
        },
        ink: {
          50: '#f9f8f3', 100: '#ece7de', 200: '#dce1e8', 300: '#c8d0db', 400: '#8896ae',
          500: '#5F6A7C', 600: '#45546A', 700: '#394459', 800: '#152839', 900: '#152839', 950: '#0d1b28',
        },
        gold: { 300: '#fbd77a', 400: '#f7c455', 500: '#f0aa24' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
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
