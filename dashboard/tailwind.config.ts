import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        pulse: {
          bg: '#000000',           // true black — like the logo
          card: '#0A0A14',         // near-black card
          card2: '#0F0F1C',        // slightly lighter for depth
          border: '#1A1A2A',       // subtle border
          text: '#F1F1F3',         // near-white text
          mute: '#6B7280',         // muted gray
          brand: '#22D3EE',        // cyan — used sparingly
          violet: '#A855F7',
          gold: '#F5B62E',         // gold rim — the primary accent
          magenta: '#EC4899',
        },
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #22D3EE 0%, #A855F7 55%, #EC4899 100%)',
        'brand-glow': 'radial-gradient(circle at 50% 50%, rgba(245,182,46,0.18) 0%, transparent 60%)',
        'card-glow': 'radial-gradient(circle at 0% 0%, rgba(245,182,46,0.08) 0%, transparent 50%)',
      },
      boxShadow: {
        brand: '0 0 24px rgba(245, 182, 46, 0.25)',
        gold: '0 0 32px rgba(245, 182, 46, 0.4)',
      },
    },
  },
  plugins: [],
};
export default config;
