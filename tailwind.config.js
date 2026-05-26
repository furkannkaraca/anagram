/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      animation: {
        "success-bounce": "success-bounce 520ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "soft-shake": "soft-shake 280ms ease-in-out both",
        shimmer: "shimmer 1.7s linear infinite",
      },
      keyframes: {
        "success-bounce": {
          "0%": { transform: "translateY(0) scale(1)" },
          "45%": { transform: "translateY(-12px) scale(1.06)" },
          "100%": { transform: "translateY(0) scale(1)" },
        },
        "soft-shake": {
          "0%, 100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-5px)" },
          "75%": { transform: "translateX(5px)" },
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
