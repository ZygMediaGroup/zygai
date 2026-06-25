/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', '-apple-system', 'sans-serif'],
        body: ['"Work Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace']
      },
      fontWeight: {
        thin: '100', extralight: '200', light: '300', normal: '400',
        medium: '500', semibold: '600', bold: '700', extrabold: '800', black: '900'
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.75rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
        '5xl': ['3rem', { lineHeight: '1' }],
        '6xl': ['3.75rem', { lineHeight: '1' }],
        '7xl': ['4.5rem', { lineHeight: '1' }],
        '8xl': ['6rem', { lineHeight: '1' }],
        '9xl': ['8rem', { lineHeight: '1' }]
      },
      lineHeight: {
        tighter: '1.1', tight: '1.2', snug: '1.3',
        normal: '1.5', relaxed: '1.625', loose: '2'
      },
      colors: {
        ink: {
          50: '#f4f4f4', 100: '#e0e0e0', 150: '#cfcfcf', 200: '#b8b8b8',
          300: '#909090', 400: '#787878', 500: '#606060', 600: '#484848',
          700: '#303030', 800: '#202020', 900: '#121212', 950: '#121212'
        },
        moss: {
          50: '#eef6f0', 100: '#d9eadf', 200: '#b6d3c1', 300: '#92b9a0',
          400: '#6b9c7f', 500: '#4d7f63', 600: '#3a634d', 700: '#2d4d3e',
          800: '#22382d', 900: '#18261f'
        },
        saffron: {
          50: '#fff7e6', 100: '#fde9bf', 150: '#fce5a3', 200: '#f9d487',
          300: '#f4ba4c', 400: '#ee9f14', 500: '#d68400', 600: '#a86500',
          700: '#7b4a00', 800: '#523100', 900: '#341f00', 950: '#220f00'
        }
      },
      spacing: {
        px: '1px', 0: '0', 0.5: '0.125rem', 1: '0.25rem', 1.5: '0.375rem',
        2: '0.5rem', 2.5: '0.625rem', 3: '0.75rem', 3.5: '0.875rem',
        4: '1rem', 5: '1.25rem', 6: '1.5rem', 7: '1.75rem', 8: '2rem',
        9: '2.25rem', 10: '2.5rem', 12: '3rem', 14: '3.5rem',
        16: '4rem', 20: '5rem', 24: '6rem'
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        sm: '0 1px 2px 0 rgba(0, 0, 0, 0.08)',
        base: '0 4px 8px 0 rgba(0, 0, 0, 0.1)',
        card: '0 20px 50px -30px rgba(42, 36, 34, 0.45)',
        'card-hover': '0 24px 64px -30px rgba(42, 36, 34, 0.55)',
        glow: '0 0 0 1px rgba(238, 159, 20, 0.35), 0 20px 40px -25px rgba(238, 159, 20, 0.4)',
        'glow-lg': '0 0 0 2px rgba(238, 159, 20, 0.25), 0 24px 48px -24px rgba(238, 159, 20, 0.5)',
        'focus-ring': '0 0 0 3px rgba(238, 159, 20, 0.1)'
      },
      borderRadius: {
        sm: '0.375rem', base: '0.5rem', md: '0.75rem', lg: '1rem',
        xl: '1.25rem', '2xl': '1.5rem', '3xl': '2rem'
      },
      keyframes: {
        floatIn: {
          '0%': { opacity: '0', transform: 'translateY(12px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' }
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' }
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' }
        },
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        pulseDots: { '0%, 100%': { opacity: '0.4' }, '50%': { opacity: '1' } },
        bounce: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-4px)' } },
        shimmer: { '0%': { backgroundPosition: '-1000px 0' }, '100%': { backgroundPosition: '1000px 0' } }
      },
      animation: {
        floatIn: 'floatIn 0.45s ease-out',
        slideIn: 'slideIn 0.35s ease-out',
        slideInRight: 'slideInRight 0.35s ease-out',
        fadeIn: 'fadeIn 0.35s ease-out',
        pulseDots: 'pulseDots 1.4s ease-in-out infinite',
        bounce: 'bounce 1s ease-in-out infinite',
        shimmer: 'shimmer 2s infinite'
      },
      transitionProperty: {
        DEFAULT: 'color, background-color, border-color, box-shadow, opacity',
        all: 'all'
      },
      transitionDuration: { DEFAULT: '200ms', fast: '100ms', slower: '300ms' },
      transitionTimingFunction: { DEFAULT: 'cubic-bezier(0.4, 0, 0.2, 1)' }
    }
  },
  plugins: [require('@tailwindcss/typography')]
};
