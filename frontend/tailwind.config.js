/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{html,ts}',
  ],
  // `hover:` só onde existe hover de verdade: no toque o estado ficava preso
  // no último elemento tocado até o próximo toque.
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {},
  },
  plugins: [],
};
