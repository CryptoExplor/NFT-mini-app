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
                'loading': 'loading 1.5s infinite',
                'fade-in': 'fadeIn 0.5s ease-in-out',
                'glow-pulse': 'glow-pulse 1.5s ease-in-out infinite alternate',
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
                    '0%': { 
                        transform: 'scale(0.95)', 
                        boxShadow: '0 0 0 rgba(79, 70, 229, 0)' 
                    },
                    '100%': { 
                        transform: 'scale(1)', 
                        boxShadow: '0 0 20px rgba(79, 70, 229, 0.5)' 
                    }
                },
                loading: {
                    '0%': { backgroundPosition: '200% 0' },
                    '100%': { backgroundPosition: '-200% 0' }
                },
                fadeIn: {
                    'from': { opacity: '0' },
                    'to': { opacity: '1' }
                },
                'glow-pulse': {
                    'from': { 
                        opacity: '0.6',
                        boxShadow: '0 0 5px #10B981'
                    },
                    'to': { 
                        opacity: '1',
                        boxShadow: '0 0 15px #10B981, 0 0 25px rgba(16, 185, 129, 0.5)'
                    }
                }
            },
            backdropBlur: {
                xs: '2px',
            }
        },
    },
    plugins: [],
    
    // Production optimizations
    future: {
        hoverOnlyWhenSupported: true,
    },
    
    // Safelist important dynamic classes
    safelist: [
        'bg-green-500/20',
        'bg-blue-500/20',
        'bg-red-500/20',
        'bg-yellow-500/20',
        'text-green-400',
        'text-blue-400',
        'text-red-400',
        'text-yellow-400',
        'border-green-500/30',
        'border-blue-500/30',
        'border-red-500/30',
        'border-yellow-500/30',
    ]
}
