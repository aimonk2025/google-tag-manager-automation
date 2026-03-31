/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'oklch(0.922 0 0)',
        input: 'oklch(0.922 0 0)',
        ring: 'oklch(0.708 0 0)',
        background: 'oklch(1 0 0)',
        foreground: 'oklch(0.145 0 0)',
        primary: {
          DEFAULT: 'oklch(0.205 0 0)',
          foreground: 'oklch(0.985 0 0)',
        },
        secondary: {
          DEFAULT: 'oklch(0.97 0 0)',
          foreground: 'oklch(0.205 0 0)',
        },
        destructive: {
          DEFAULT: 'oklch(0.577 0.245 27.325)',
          foreground: 'oklch(0.985 0 0)',
        },
        muted: {
          DEFAULT: 'oklch(0.97 0 0)',
          foreground: 'oklch(0.556 0 0)',
        },
        accent: {
          DEFAULT: 'oklch(0.97 0 0)',
          foreground: 'oklch(0.205 0 0)',
        },
        card: {
          DEFAULT: 'oklch(1 0 0)',
          foreground: 'oklch(0.145 0 0)',
        },
        sidebar: {
          DEFAULT: 'oklch(0.985 0 0)',
          foreground: 'oklch(0.145 0 0)',
          primary: 'oklch(0.205 0 0)',
          'primary-foreground': 'oklch(0.985 0 0)',
          accent: 'oklch(0.97 0 0)',
          'accent-foreground': 'oklch(0.205 0 0)',
          border: 'oklch(0.922 0 0)',
        },
      },
      borderRadius: {
        lg: '0px',
        md: '0px',
        sm: '0px',
        DEFAULT: '0px',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'Consolas', 'monospace'],
      },
      transitionDuration: {
        fast: '100ms',
      },
    },
  },
  plugins: [],
}
