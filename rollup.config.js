import indexHTML from "rollup-plugin-index-html";

export default config => ({
  input: "./index.html",
  output: {
    dir: "dist", // replaced file as we now output at least one index.html and one js file
    format: "esm" // replaced iife as we also generate an index.html which then loads the es module bundle
  },
  plugins: [indexHTML({ ...config, rootDir: __dirname })]
});
