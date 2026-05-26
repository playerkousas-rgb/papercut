import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#02133e",
          50: "#e8ebf3",
          100: "#c5cce0",
          200: "#9eaac9",
          300: "#7787b2",
          400: "#5a6da1",
          500: "#3d5390",
          600: "#344a82",
          700: "#293e71",
          800: "#1e3260",
          900: "#02133e",
          950: "#010a24",
        },
        accent: "#f4b740",
      },
      fontFamily: {
        sans: ["var(--font-noto)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
