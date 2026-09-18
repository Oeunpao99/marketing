/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#166432',
          light: '#22853E',
          dark: '#0E4A24',
        },
        coral: {
          300: '#FFB5A7',
          400: '#FF8A7A',
          500: '#FF6B5A',
          600: '#E85545',
        },
        violet: {
          300: '#C4B5FD',
          400: '#A78BFA',
          500: '#8B5CF6',
          600: '#7C3AED',
        },
        amber: {
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
        },
        ink: {
          DEFAULT: '#1A1D23',
          50: '#F7F8F9',
          100: '#EDEEF0',
          200: '#D6D9DE',
          300: '#B0B7C1',
          400: '#5A6470',
          500: '#3D454F',
          600: '#2E343C',
          700: '#262C33',
          800: '#262C33',
          900: '#1A1D23',
          950: '#12141A',
        },
      },
      fontFamily: {
        sans: ['"Nunito Sans"', '"Khmer OS Siemreap"', 'system-ui', 'sans-serif'],
        display: ['"Nunito Sans"', '"Khmer OS Siemreap"', 'system-ui', 'sans-serif'],
        mono: ['"Nunito Sans"', 'ui-monospace', 'monospace'],
        khmer: ['"Khmer OS Siemreap"', '"Nunito Sans"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 20px rgba(22,100,50,0.15)',
        'glow-lg': '0 4px 30px rgba(22,100,50,0.2)',
        card: 'none',
        'card-hover': 'none',
        dock: '0 2px 8px rgba(0,0,0,0.08), 0 20px 48px -16px rgba(0,0,0,0.2)',
      },
      borderRadius: {
        xl2: '14px',
        '2xl': '18px',
      },
      keyframes: {
        fadein: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        'post-pop': {
          '0%': { transform: 'scale(0.97)', opacity: '0.4', boxShadow: '0 0 0 0 rgba(22,100,50,0.35)' },
          '55%': { transform: 'scale(1.015)', opacity: '1', boxShadow: '0 0 0 6px rgba(22,100,50,0)' },
          '100%': { transform: 'scale(1)', opacity: '1', boxShadow: '0 0 0 0 rgba(22,100,50,0)' },
        },
        'sending-stripes': {
          from: { backgroundPosition: '0 0' },
          to: { backgroundPosition: '28px 0' },
        },
        'media-reveal': {
          '0%': { opacity: '0', transform: 'scale(.92)', filter: 'blur(14px)' },
          '55%': { opacity: '1', filter: 'blur(0)' },
          '100%': { opacity: '1', transform: 'scale(1)', filter: 'blur(0)' },
        },
        indeterminate: {
          '0%': { left: '-45%', width: '45%' },
          '55%': { width: '65%' },
          '100%': { left: '100%', width: '45%' },
        },
      },
      animation: {
        fadein: 'fadein .25s ease-out',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'post-pop': 'post-pop .5s ease-out',
        'sending-stripes': 'sending-stripes .8s linear infinite',
        'media-reveal': 'media-reveal .62s cubic-bezier(.2,.7,.2,1)',
        indeterminate: 'indeterminate 1.15s cubic-bezier(.5,.1,.5,.9) infinite',
      },
    },
  },
  plugins: [],
}
