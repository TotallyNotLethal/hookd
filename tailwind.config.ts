import type { Config } from "tailwindcss";
const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1400px" } },
    extend: {
      fontFamily: {
        inter: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Arial'],
      },
      colors: {
        brand: {
          50: "#e8f6ff",
          100: "#cfeaff",
          200: "#a2d9ff",
          300: "#6cc2ff",
          400: "#34a6ff",
          500: "#0d8be6",
          600: "#006ab3",
          700: "#004f80",
          800: "#073a59",
          900: "#072a40",
        },
      },
      boxShadow: {
        soft: "0 10px 30px rgba(3, 27, 61, 0.15)",
        glow: "0 0 40px rgba(13, 139, 230, 0.35)",
      },
    },
  },
  plugins: [],
};
export default config;
