"use strict";

const got = require("got");
const {sync: rimrafSync} = require("rimraf");
const {tmpdir} = require("os");
const {writeFile, mkdtemp, readFile} = require("fs").promises;
const {join: pathJoin} = require("path");
const {spawnSync, spawn} = require("child_process");

const oneMinute = 60000;
const shortRepoPattern = new RegExp(/^(github[\/:])?([^\/]+\/[^\/#\?"']+)$/i);
const ghPattern = new RegExp(
  /(git@)?github\.com[\/:]([^\/]+\/[^\/#\?"']+)(\.git)?/gi
);
const stripGitAt = (str) =>
  str.startsWith("git@") ? str.slice("git@".length) : str;
const stripGh = (str) =>
  str.startsWith("github.com") ? str.slice("github.com/".length) : str;
const stripGit = (str) =>
  str.endsWith(".git") ? str.slice(0, ".git".length * -1) : str;
const normalize = (str) => stripGh(stripGitAt(stripGit(str))).toLowerCase();

const scanForRefs = (packageData) => {
  const {bugs, homepage, repository} = packageData;
  const suspects = JSON.stringify({bugs, homepage, repository});
  const hits = [...suspects.matchAll(ghPattern)].map((m) => m[2]);
  const shortRepo = shortRepoPattern.exec(repository);
  if (shortRepo && shortRepo[2]) {
    hits.push(shortRepo[2]);
  }
  const uniqueHits = new Set(hits.map(normalize));
  return Array.from(uniqueHits.values());
};

exports.resolveByNpmInstall = async (deps, rootPkg, {verbose}) => {
  // Install in a tmp dir.
  const installSite = await mkdtemp(pathJoin(tmpdir(), "stack-lookup-"));
  await writeFile(
    pathJoin(installSite, "package.json"),
    JSON.stringify(rootPkg, null, 2)
  );
  const npmRes = spawnSync("npm", ["i", "--ignore-scripts", "--no-audit"], {
    cwd: installSite,
    timeout: oneMinute,
  });

  if (npmRes.status > 0) {
    console.warn(npmRes.stderr.toString());
    throw new Error("Failed NPM install");
  } else {
    if (verbose) {
      console.log("NPM:", npmRes.stdout.toString());
      console.warn("NPM WARN:", npmRes.stderr.toString());
    }
  }

  const depMap = new Map();
  for (const dep of deps) {
    try {
      const packageData = JSON.parse(
        await readFile(
          pathJoin(installSite, "node_modules", dep, "package.json")
        )
      );
      const refs = scanForRefs(packageData);

      if (refs.length === 0) {
        console.warn(`No match for package: ${dep}`);
      }
      if (refs.length > 1) {
        console.warn(`Ambiquous matches for package: ${dep}`, refs);
      }
      if (refs.length === 1) {
        depMap.set(dep, refs[0]);
      }
    } catch (e) {
      console.warn(
        `Failed to read package.json for package: ${dep}`,
        e.message || e
      );
      continue;
    }
  }

  rimrafSync(installSite);

  return depMap;
};

exports.resolveByJsDelivr = async (deps) => {
  const depMap = new Map();

  // Get packages one by one.
  for (const dep of deps) {
    try {
      const url = `https://cdn.jsdelivr.net/npm/${dep}/package.json`;
      const httpResult = await got.get(url, {json: true});
      const refs = scanForRefs(httpResult.body);

      if (refs.length === 0) {
        console.warn(`No match for package: ${dep}`);
      }
      if (refs.length > 1) {
        console.warn(`Ambiquous matches for package: ${dep}`, refs);
      }
      if (refs.length === 1) {
        depMap.set(dep, refs[0]);
      }
    } catch (e) {
      console.warn(
        `Failed to read package.json for package: ${dep}`,
        e.message || e
      );
      continue;
    }
  }

  return depMap;
};
