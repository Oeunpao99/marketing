/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Driven by CSS variables so the accent is user-selectable
        // (Settings → Appearance; see src/lib/theme.js). Defaults in index.css.
        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          light: 'rgb(var(--brand-light) / <alpha-value>)',
          dark: 'rgb(var(--brand-dark) / <alpha-value>)',
          soft: 'rgb(var(--brand-soft) / <alpha-value>)',
          softer: 'rgb(var(--brand-softer) / <alpha-value>)',
          line: 'rgb(var(--brand-line) / <alpha-value>)',
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
          200: '#D8DBDF',
          300: '#B3BAC3',
          400: '#6B7683',
          500: '#4A535F',
          600: '#323A44',
          700: '#262C33',
          800: '#1E232A',
          900: '#16191E',
          950: '#0E1014',
        },
      },
      fontFamily: {
        sans: ['Inter', '"Khmer OS Siemreap"', 'system-ui', 'sans-serif'],
        display: ['Poppins', '"Khmer OS Siemreap"', 'system-ui', 'sans-serif'],
        khmer: ['"Khmer OS Siemreap"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"SF Mono"', '"Cascadia Code"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(22, 25, 29, 0.04), 0 1px 1px rgba(22, 25, 29, 0.03)',
        'card-hover': '0 4px 14px rgba(22, 25, 29, 0.08), 0 1px 2px rgba(22, 25, 29, 0.05)',
        pop: '0 12px 32px -8px rgba(22, 25, 29, 0.18), 0 2px 8px rgba(22, 25, 29, 0.06)',
        dock: '0 2px 8px rgba(0,0,0,0.08), 0 20px 48px -16px rgba(0,0,0,0.2)',
        drawer: '-12px 0 40px -12px rgba(22, 25, 29, 0.22)',
        glow: '0 0 20px rgb(var(--brand) / 0.18)',
        'glow-lg': '0 6px 28px -6px rgb(var(--brand) / 0.4)',
        ring: '0 0 0 3px rgb(var(--brand) / 0.12)',
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
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(28px)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        'sheet-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        'drawer-in': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        'ai-dot': {
          '0%, 80%, 100%': { transform: 'translateY(0)', opacity: '0.4' },
          '40%': { transform: 'translateY(-4px)', opacity: '1' },
        },
        'ai-pulse': {
          '0%': { boxShadow: '0 0 0 0 rgba(26,111,196,0.35)' },
          '70%': { boxShadow: '0 0 0 14px rgba(26,111,196,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(26,111,196,0)' },
        },
        shimmer: {
          from: { backgroundPosition: '-200% 0' },
          to: { backgroundPosition: '200% 0' },
        },
        'check-pop': {
          '0%': { transform: 'scale(0.5)', opacity: '0' },
          '60%': { transform: 'scale(1.08)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'post-pop': {
          '0%': { transform: 'scale(0.97)', opacity: '0.4', boxShadow: '0 0 0 0 rgba(26,111,196,0.25)' },
          '55%': { transform: 'scale(1.012)', opacity: '1', boxShadow: '0 0 0 6px rgba(26,111,196,0)' },
          '100%': { transform: 'scale(1)', opacity: '1', boxShadow: '0 0 0 0 rgba(26,111,196,0)' },
        },
        'sending-stripes': {
          from: { backgroundPosition: '0 0' },
          to: { backgroundPosition: '28px 0' },
        },
        'media-reveal': {
          '0%': { opacity: '0', transform: 'scale(.96)', filter: 'blur(8px)' },
          '60%': { opacity: '1', filter: 'blur(0)' },
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
        'slide-up': 'slide-up .3s cubic-bezier(.2,.7,.2,1)',
        'slide-in-right': 'slide-in-right .3s cubic-bezier(.2,.7,.2,1)',
        'drawer-in': 'drawer-in .32s cubic-bezier(.2,.7,.2,1)',
        'sheet-up': 'sheet-up .3s cubic-bezier(.2,.8,.2,1)',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'ai-dot': 'ai-dot 1.2s ease-in-out infinite',
        'ai-pulse': 'ai-pulse 2.4s ease-out infinite',
        shimmer: 'shimmer 1.6s linear infinite',
        'check-pop': 'check-pop .4s cubic-bezier(.2,.7,.2,1)',
        'post-pop': 'post-pop .5s ease-out',
        'sending-stripes': 'sending-stripes .8s linear infinite',
        'media-reveal': 'media-reveal .6s cubic-bezier(.2,.7,.2,1)',
        indeterminate: 'indeterminate 1.15s cubic-bezier(.5,.1,.5,.9) infinite',
      },
    },
  },
  plugins: [],
}