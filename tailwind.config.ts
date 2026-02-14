import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Manrope'", "system-ui", "sans-serif"]
      },
      colors: {
        panel: {
          light: "#f8fafb",
          dark: "#0f172a"
        },
        accent: {
          50: "#ecfeff",
          100: "#cffafe",
          500: "#06b6d4",
          600: "#0891b2"
        }
      },
      boxShadow: {
        soft: "0 20px 45px -25px rgba(15, 23, 42, 0.4)"
      }
    }
  },
  plugins: []
} satisfies Config;
