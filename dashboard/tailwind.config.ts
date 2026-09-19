import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        pulse: {
          bg: '#080B14',
          card: '#0F1424',
          border: '#1E2438',
          text: '#E5E7EB',
          mute: '#8892B0',
          brand: '#22D3EE',      // logo cyan
          violet: '#A855F7',     // logo violet ring
          gold: '#F59E0B',       // logo gold rim
          magenta: '#EC4899',    // logo magenta accent
        },
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #22D3EE 0%, #A855F7 55%, #EC4899 100%)',
        'brand-glow': 'radial-gradient(circle at 50% 50%, rgba(34,211,238,0.25) 0%, transparent 60%)',
      },
      boxShadow: {
        brand: '0 0 20px rgba(34, 211, 238, 0.35)',
      },
    },
  },
  plugins: [],
};
export default config;
