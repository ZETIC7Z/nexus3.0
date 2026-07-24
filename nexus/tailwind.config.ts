import { allThemes, defaultTheme, safeThemeList } from "./themes";
import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

const themer = require("tailwindcss-themer");

const config: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  safelist: safeThemeList,
  theme: {
    extend: {
      /* breakpoints */
      screens: {
        xs: "350px",
        ssm: "400px",
        "2xl": "1921px", // Custom breakpoint for screens at least 1920px wide
        "3xl": "2650px", // Custom breakpoint for screens at least 2650px wide
        "4xl": "3840px", // Custom breakpoint for screens at least 4096px wide
      },

      /* fonts */
      fontFamily: {
        main: "'DM Sans'", // "main": "'Open Sans'",
      },

      /* animations */
      keyframes: {
        "loading-pin": {
          "0%, 40%, 100%": { height: "0.5em", "background-color": "#282336" },
          "20%": { height: "1em", "background-color": "white" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "gradient-flow": {
          "0%": { "background-position": "0% 50%" },
          "100%": { "background-position": "300% 50%" },
        },
        "seek-left": {
          "0%": { transform: "translateX(0) scale(1)", opacity: "1" },
          "100%": { transform: "translateX(-50px) scale(1.2)", opacity: "0" },
        },
        "seek-right": {
          "0%": { transform: "translateX(0) scale(1)", opacity: "1" },
          "100%": { transform: "translateX(50px) scale(1.2)", opacity: "0" },
        },
      },
      animation: {
        "loading-pin": "loading-pin 1.8s ease-in-out infinite",
        "fade-in": "fade-in 200ms ease-out forwards",
        "gradient-flow": "gradient-flow 8s linear infinite",
        "seek-left": "seek-left 0.5s cubic-bezier(0, 0, 0.2, 1) forwards",
        "seek-right": "seek-right 0.5s cubic-bezier(0, 0, 0.2, 1) forwards",
      },

      /* shared elevation + easing tokens */
      boxShadow: {
        "soft-sm": "0 2px 8px rgba(0,0,0,0.18)",
        "soft-md": "0 8px 24px rgba(0,0,0,0.28)",
        "soft-lg": "0 18px 60px rgba(0,0,0,0.45)",
      },
      transitionTimingFunction: {
        "out-quint": "cubic-bezier(0.22, 1, 0.36, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
    },
  },
  plugins: [
    require("tailwind-scrollbar"),
    themer({
      defaultTheme: defaultTheme,
      themes: [
        {
          name: "default",
          selectors: [".theme-default"],
          ...defaultTheme,
        },
        ...allThemes,
      ],
    }),
    plugin(({ addVariant }) => {
      addVariant("dir-neutral", "[dir] &");
    }),
  ],
};

export default config;
