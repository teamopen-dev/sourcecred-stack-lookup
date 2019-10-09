/* global process require */

import node from "rollup-plugin-node-resolve";
import commonjs from "rollup-plugin-commonjs";
import json from "rollup-plugin-json";

export default {
  input: "src/client.js",
  output: {
    format: "umd",
    name: "TeamOpenSourcecredStackLookup",
    file: "index.js",
  },
  plugins: [node(), commonjs(), json()],
};
