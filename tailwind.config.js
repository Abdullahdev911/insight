/** @type {import('tailwindcss').Config} */
module.exports = {
  // CORRECTED: Point to the 'app' folder to catch all routes
  content: [
    "./app/**/*.{js,jsx,ts,tsx}", 
    "./components/**/*.{js,jsx,ts,tsx}"
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: '#020617', 
        surface: '#0f172a',    
        surfaceHighlight: '#1e293b', 
        primary: '#06b6d4',    
        secondary: '#3b82f6',  
        text: '#f8fafc',       
        textDim: '#94a3b8',    
      },
    },
  },
  plugins: [],
}