/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: '#0066FF',
                legendary: '#6366F1',
                aurora: '#8B5CF6'
            },
            animation: {
                'aurora': 'aurora 20s ease-in-out infinite',
                'float': 'float 6s ease-in-out infinite',
                'shimmer': 'shimmer 2.5s linear infinite',
                'scale-glow': 'scale-glow 0.3s ease-out',
                'loading': 'loading 1.5s infinite'
            },
            keyframes: {
                aurora: {
                    '0%, 100%': {
                        transform: 'translateX(-50%) translateY(-50%) rotate(0deg) scale(1)',
                        opacity: '0.3'
                    },
                    '33%': {
                        transform: 'translateX(-30%) translateY(-30%) rotate(120deg) scale(1.2)',
                        opacity: '0.5'
                    },
                    '66%': {
                        transform: 'translateX(-70%) translateY(-70%) rotate(240deg) scale(0.8)',
                        opacity: '0.3'
                    }
                },
                float: {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(-10px)' }
                },
                shimmer: {
                    '0%': { backgroundPosition: '200% 0' },
                    '100%': { backgroundPosition: '-200% 0' }
                },
                'scale-glow': {
                    '0%': { transform: 'scale(0.95)', boxShadow: '0 0 0 rgba(79, 70, 229, 0)' },
                    '100%': { transform: 'scale(1)', boxShadow: '0 0 20px rgba(79, 70, 229, 0.5)' }
                },
                'loading': {
                    '0%': { backgroundPosition: '200% 0' },
                    '100%': { backgroundPosition: '-200% 0' }
                }
            }
        },
    },
    plugins: [],
}
