"use strict";

const {sync: mkdirpSync} = require("mkdirp");
const {resolve} = require("path");

const {getDirectDepsFrom} = require("./directDeps");
const {resolveByJsDelivr} = require("./ghResolver");
const {createMetaFileHandle} = require("./metaFile");
const {startLoadingScores} = require("./scoreLoader");

const oneMinute = 60000;
const oneDay = 24 * 3600 * 1000;

const targetLoadTimeMins = new Number(process.env.TARGET_LOAD_TIME_MINS || 10);
const nodePath = process.argv[0];

const verbose = process.env.VERBOSE == "y" || false;
const SOURCECRED_GITHUB_TOKEN = process.env.SOURCECRED_GITHUB_TOKEN;
const cliPath = process.env.SOURCECRED_CLI;

// Our "main" function?
// Just want async/await in a scripting context :D
(async () => {
  // Locate the supplied package.json
  const relPath = process.argv.slice(2);
  const {deps} = await getDirectDepsFrom(relPath);
  if (verbose) console.log("Dependencies:", deps);

  // Switch from tmp dir to local data.
  const scDir = resolve(process.cwd(), ".sourcecred");
  const scoresDir = resolve(process.cwd(), ".scores");
  const instanceDir = resolve(process.cwd(), ".instances");
  mkdirpSync(scDir);
  mkdirpSync(scoresDir);
  mkdirpSync(instanceDir);

  // Get our metadata.
  const meta = await createMetaFileHandle(scoresDir, {verbose});

  // Find out which we need to reload.
  const reloadSetNpm = Array.from(deps.values()).filter((npmName) =>
    meta.packageHasAge(npmName, 2 * oneDay)
  );

  console.log("Packages that need reloading:", reloadSetNpm.length);

  // Install in a tmp dir.
  console.log("Fetching dependency data from NPM");
  const depMap = await resolveByJsDelivr(reloadSetNpm);
  if (verbose) console.log(depMap);
  meta.storePackageRefs(depMap);

  // Map dependencies to refs.
  const reloadSet = meta.packagesToRefs(reloadSetNpm);

  // It's madness to have < 60s to load. So limit our selection accordingly.
  const clampedReloadSet = reloadSet.slice(0, targetLoadTimeMins);
  console.log("Queue size:", reloadSet.length);

  startLoadingScores({
    reloadSet,
    scoresDir,
    scDir,
    depMap,
    nodePath,
    cliPath,
    meta,
    instanceDir,
    targetLoadTimeMins,
    SOURCECRED_GITHUB_TOKEN,
  });
})();
