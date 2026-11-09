import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#101D32", 700: "#1B2D4A", 600: "#2A4064" },
        teal: { DEFAULT: "#12A99A", 600: "#0E8C80" },
        mint: "#DDF6F0",
        soft: "#F5F8FA",
      },
      borderRadius: { DEFAULT: "6px", md: "6px", lg: "8px" },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
