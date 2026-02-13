/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Cores base do sistema Ahri (persona padrão)
        'ahri-primary': 'var(--persona-primary, #d8b4d8)',
        'ahri-secondary': 'var(--persona-secondary, #e9cce9)',
        'ahri-glow': 'var(--persona-glow, rgba(216, 180, 216, 0.6))',
        // Agent Design System colors
        'agent-bg-primary': 'var(--agent-bg-primary)',
        'agent-bg-secondary': 'var(--agent-bg-secondary)',
        'agent-bg-tertiary': 'var(--agent-bg-tertiary)',
        'agent-border': 'var(--agent-border)',
        'agent-border-strong': 'var(--agent-border-strong)',
        'agent-text-primary': 'var(--agent-text-primary)',
        'agent-text-secondary': 'var(--agent-text-secondary)',
        'agent-text-tertiary': 'var(--agent-text-tertiary)',
        'agent-accent': 'var(--agent-accent)',
        'agent-success': 'var(--agent-success)',
        'agent-warning': 'var(--agent-warning)',
        'agent-error': 'var(--agent-error)',
        'agent-info': 'var(--agent-info)',
        'agent-working': 'var(--agent-working)',
        // Persona dynamic colors
        'persona-primary': 'var(--persona-primary)',
        'persona-secondary': 'var(--persona-secondary)',
      },
      fontFamily: {
        sans: ['"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"Fira Code"', '"JetBrains Mono"', '"Consolas"', 'monospace'],
      },
      backdropBlur: {
        'glass': '20px',
      },
    },
  },
  plugins: [],
};
