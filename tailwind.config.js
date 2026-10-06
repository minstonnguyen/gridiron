/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Barlow Condensed"', '"Arial Narrow"', 'sans-serif'],
        sans: ['Barlow', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: { 950: '#04070d', 900: '#070b14', 850: '#0a101c', 800: '#0d1424', 700: '#121b30', 600: '#1a2540', 500: '#26324f' },
        line: 'rgba(148,170,210,0.12)',
        fg: { DEFAULT: '#e9eef8', muted: '#8d99b1', dim: '#5f6b84' },
        ice: '#5ad8ff',
        volt: '#c8ff4d',
      },
      boxShadow: {
        card: '0 1px 0 rgba(255,255,255,0.05) inset, 0 12px 32px -12px rgba(0,0,0,0.7)',
        glow: '0 0 0 1px var(--team, #5ad8ff), 0 10px 40px -10px var(--team, #5ad8ff)',
      },
      keyframes: {
        sheen: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        rise: { '0%': { opacity: 0, transform: 'translateY(6px)' }, '100%': { opacity: 1, transform: 'none' } },
      },
      animation: { sheen: 'sheen 2.4s linear infinite', rise: 'rise .35s ease-out both' },
    },
  },
  plugins: [],
};
