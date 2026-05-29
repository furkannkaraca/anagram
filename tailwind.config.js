/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Bebas Neue", "Barlow Condensed", "system-ui"],
        body: ["Barlow Condensed", "system-ui"],
      },
      animation: {
        "level-up": "level-up 1.5s ease-out both",
        "success-bounce": "success-bounce 520ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
        shake: "shake 320ms ease-in-out both",
        "soft-shake": "soft-shake 280ms ease-in-out both",
        shimmer: "shimmer 1.7s linear infinite",
      },
      keyframes: {
        "success-bounce": {
          "0%": { transform: "translateY(0) scale(1)" },
          "45%": { transform: "translateY(-12px) scale(1.06)" },
          "100%": { transform: "translateY(0) scale(1)" },
        },
        "level-up": {
          "0%": { opacity: "0", transform: "translateY(10px) scale(0.96)" },
          "18%, 78%": { opacity: "1", transform: "translateY(0) scale(1)" },
          "100%": { opacity: "0", transform: "translateY(-8px) scale(0.98)" },
        },
        "soft-shake": {
          "0%, 100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-5px)" },
          "75%": { transform: "translateX(5px)" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%": { transform: "translateX(-7px)" },
          "40%": { transform: "translateX(7px)" },
          "60%": { transform: "translateX(-5px)" },
          "80%": { transform: "translateX(5px)" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
    },
  },
  plugins: [],
};
