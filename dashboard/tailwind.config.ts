import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        pulse: {
          bg: '#0B0F1A',
          card: '#111827',
          border: '#1F2937',
          text: '#E5E7EB',
          mute: '#94A3B8',
          brand: '#38BDF8',
          gold: '#FFD700',
          violet: '#9F7AEA',
        },
      },
    },
  },
  plugins: [],
};
export default config;
