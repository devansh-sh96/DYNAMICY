/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // OLED blacks
        base: {
          DEFAULT: '#050505',
          elevated: '#0a0a0a',
          raised: '#101010',
          overlay: '#151515'
        },
        // Subtle monochrome borders
        line: {
          DEFAULT: '#1f1f1f',
          soft: '#161616',
          strong: '#2a2a2a'
        },
        // Monochrome surface text
        mono: {
          DEFAULT: '#e5e5e5',
          soft: '#9a9a9a',
          muted: '#565656',
          faint: '#303030'
        },
        // Frosted glass translucency
        glass: {
          DEFAULT: 'rgba(10, 10, 10, 0.65)',
          solid: 'rgba(5, 5, 5, 0.85)'
        }
      },
      boxShadow: {
        glass:
          '0 8px 30px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.04)'
      },
      borderRadius: {
        glass: '0.75rem'
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif'
        ],
        mono: ['JetBrains Mono', 'Cascadia Code', 'Consolas', 'monospace']
      }
    }
  },
  plugins: []
}