import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#F2F7F4',
          100: '#E1ECE5',
          200: '#C2D8CB',
          300: '#99BEA8',
          400: '#6AA081',
          500: '#438160',
          600: '#2D5A40',
          700: '#1E3A2B', // Core SaaS Forest Green
          800: '#182F24',
          900: '#12231B',
        },
        surface: {
          canvas: '#F8F9FA',
          card: '#FFFFFF',
          sidebar: '#12231B',
        },
        status: {
          present: '#059669', // Emerald
          absent: '#DC2626',  // Crimson
          late: '#D97706',    // Amber
        }
      },
    },
  },
  plugins: [],
};

export default config;
