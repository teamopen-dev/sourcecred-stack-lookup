"use strict";

const {resolve} = require("path");
const {readFile} = require("fs").promises;
const {constants: fsConst} = require("fs");

exports.getDirectDepsFrom = async (relPackageJson) => {
  const allPkgs = [];
  let deps = new Set();

  for (const relPath of relPackageJson) {
    const absPath = resolve(process.cwd(), relPath);
    if (!absPath.endsWith("package.json")) {
      throw new Error(`You should provide a package.json, got: ${absPath}`);
    }

    // Read the supplied package json.
    const rootPkg = JSON.parse(await readFile(absPath));
    deps = new Set([
      ...deps.values(),
      ...Object.keys(rootPkg.dependencies || {}),
      ...Object.keys(rootPkg.devDependencies || {}),
      ...Object.keys(rootPkg.peerDependencies || {}),
    ]);
    allPkgs.push(rootPkg);
  }

  return {deps, allPkgs};
};
