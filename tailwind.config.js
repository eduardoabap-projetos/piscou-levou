/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: '#FF6B00',
          'orange-light': '#FF8C38',
          'orange-dark': '#CC5500',
          yellow: '#FFD700',
          'yellow-light': '#FFE64D',
        },
        dark: {
          bg: '#0A0A0A',
          surface: '#111111',
          card: '#1A1A1A',
          border: '#2A2A2A',
          hover: '#222222',
        },
        text: {
          primary: '#F5F5F5',
          secondary: '#D1D5DB',
          muted: '#6B7280',
          disabled: '#4B5563',
        },
        success: '#22C55E',
        danger: '#EF4444',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        heading: ['Poppins', 'sans-serif'],
      },
      aspectRatio: {
        square: '1 / 1',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'shimmer': 'shimmer 1.5s infinite',
        'badge-bounce': 'badgeBounce 1s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 15px rgba(255, 107, 0, 0.3)' },
          '50%': { boxShadow: '0 0 30px rgba(255, 107, 0, 0.7)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        badgeBounce: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.08)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #FF6B00 0%, #FF8C38 50%, #FFD700 100%)',
        'gradient-dark': 'linear-gradient(180deg, #0A0A0A 0%, #111111 100%)',
        'gradient-card': 'linear-gradient(145deg, #1A1A1A 0%, #151515 100%)',
        'gradient-hero': 'linear-gradient(135deg, #0A0A0A 0%, #1A0A00 50%, #0A0A0A 100%)',
        'shimmer-bg': 'linear-gradient(90deg, #1A1A1A 25%, #2A2A2A 50%, #1A1A1A 75%)',
      },
      boxShadow: {
        'card': '0 4px 20px rgba(0, 0, 0, 0.4)',
        'card-hover': '0 8px 40px rgba(255, 107, 0, 0.25)',
        'orange-glow': '0 0 20px rgba(255, 107, 0, 0.5)',
        'btn': '0 4px 15px rgba(255, 107, 0, 0.4)',
        'btn-hover': '0 6px 25px rgba(255, 107, 0, 0.6)',
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.5rem',
      },
    },
  },
  plugins: [],
};
