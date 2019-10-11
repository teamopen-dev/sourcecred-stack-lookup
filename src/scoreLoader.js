"use strict";

const glob = require("globby");
const {knuthShuffle} = require("knuth-shuffle");
const {spawn} = require("child_process");
const {existsSync} = require("fs");
const {writeFile, readdir, stat, rename} = require("fs").promises;
const {sync: mkdirpSync} = require("mkdirp");
const {join: pathJoin} = require("path");
const delay = require("delay");
const {Deflate} = require("pako");
const {hexOf} = require("./util");

const oneMinute = 60000;
const maxPerLoad = 10 * oneMinute;

const getMtimes = async (scDir) => {
  const cacheFiles = await readdir(pathJoin(scDir, "cache"));
  const mtime = new Map();
  for (const f of cacheFiles) {
    mtime.set(f, (await stat(pathJoin(scDir, "cache", f))).mtime);
  }
  return mtime;
};

const mkGzip = (decompress) => async (path) => {
  const ext = decompress ? "*.{db,json}.gz" : "*.{db,json}";
  const files = await glob(pathJoin(path, "**", ext));
  if (!files.length) return;
  await new Promise((res, rej) => {
    const ps = spawn("gzip", [decompress ? "-df" : "-f", ...files]);
    ps.stdout.pipe(process.stdout);
    ps.stderr.pipe(process.stderr);
    ps.on("close", (code) => {
      code === 0 ? res() : rej(code);
    });
  });
};

const gzip = mkGzip(false);
const ungzip = mkGzip(true);

exports.startLoadingScores = ({
  reloadSet,
  scoresDir,
  scDir,
  depMap,
  nodePath,
  cliPath,
  targetLoadTimeMins,
  meta,
  instanceDir,
  SOURCECRED_GITHUB_TOKEN,
}) => {
  const doneWhen = targetLoadTimeMins * oneMinute + Date.now();
  let spawnQueue = Array.from(knuthShuffle([...reloadSet]));
  let killTimeout;
  let childToKill = null;

  const clearKillTimeout = () => {
    if (killTimeout) {
      clearTimeout(killTimeout);
      killTimeout = null;
    }
  };
  const setKillTimeout = () => {
    clearKillTimeout();
    killTimeout = setTimeout(() => {
      childToKill.kill("SIGINT");
      childToKill = null;
    }, maxPerLoad);
  };
  process.on("SIGINT", () => {
    clearKillTimeout();
    if (childToKill) {
      console.log("Received SIGINT. Forwarding this to our child process.");
      spawnQueue = [];
      childToKill.kill("SIGINT");
    } else {
      process.exit();
    }
  });

  const openInstance = async (ref) => {
    const instancePath = pathJoin(instanceDir, hexOf(ref));
    const existingInstance = existsSync(instancePath);
    if (existingInstance) {
      await ungzip(instancePath);
      return {existingInstance, dir: instancePath};
    }

    // Include cache mtime list.
    try {
      const mtime = await getMtimes(scDir);
      return {
        existingInstance,
        targetDir: instancePath,
        dir: scDir,
        mtime,
      };
    } catch (e) {
      console.warn(e);
      return {
        existingInstance,
        dir: scDir,
      };
    }
  };

  const closeInstance = async (instance) => {
    let gzipDir = instance.existingInstance ? instance.dir : null;
    if (!instance.existingInstance) {
      // find modified cache to extract
      if (!instance.mtime || instance.mtime.size == 0) {
        console.warn("No original mtime");
        return;
      }

      const mtime = await getMtimes(scDir);
      const bumped = new Map();
      for (const [f, newMtime] of mtime) {
        const oldMtime = instance.mtime.get(f) || 0;
        if (oldMtime < newMtime) {
          bumped.set(f, newMtime - oldMtime);
        }
      }

      if (bumped.size > 1) console.log(bumped);
      if (bumped.size == 1) {
        const f = bumped.keys().next().value;
        const src = pathJoin(instance.dir, "cache", f);
        const tgtCache = pathJoin(instance.targetDir, "cache");
        const tgt = pathJoin(tgtCache, f);
        mkdirpSync(tgtCache);
        console.warn("Moving 1 modified cache entry to new instance");
        await rename(src, tgt);
        gzipDir = instance.targetDir;
      }
    }

    if (gzipDir) {
      await gzip(gzipDir);
    }
  };

  const scoreNext = async (ref, instance) => {
    const deflate = new Deflate({gzip: true, level: 9});
    const jsonGzPath = pathJoin(scoresDir, `${hexOf(ref)}.json.gz`);
    const scoreSourceCred = spawn(nodePath, [cliPath, "scores", ref], {
      timeout: oneMinute,
      env: {SOURCECRED_DIRECTORY: instance.dir},
    });
    childToKill = scoreSourceCred;

    // Pipe data into gzip.
    scoreSourceCred.stdout.on("data", (chunk) => {
      deflate.push(chunk, false);
    });
    scoreSourceCred.stdout.on("end", async (chunk) => {
      deflate.push(Buffer.alloc(0), true);
      await writeFile(jsonGzPath, deflate.result);
    });

    scoreSourceCred.stderr.pipe(process.stderr);
    scoreSourceCred.on("close", async (code) => {
      childToKill = null;
      meta.bumpScore(ref);
      console.log(`child process exited with code ${code}`);
      await closeInstance(instance);
      loadNext();
    });
  };

  let failedLoad = 0;
  const loadNext = async () => {
    if (doneWhen <= Date.now()) {
      console.warn("Out of time, returning");
      return;
    }

    const ref = spawnQueue.pop();
    if (ref === undefined) {
      if (failedLoad > 0) {
        console.warn("One of the deps failed to load");
      }
      return;
    }

    const instance = await openInstance(ref);

    const loadSourceCred = spawn(nodePath, [cliPath, "load", ref], {
      timeout: maxPerLoad,
      env: {SOURCECRED_GITHUB_TOKEN, SOURCECRED_DIRECTORY: instance.dir},
    });

    childToKill = loadSourceCred;
    setKillTimeout();
    loadSourceCred.stdout.pipe(process.stdout);
    loadSourceCred.stderr.pipe(process.stderr);
    loadSourceCred.on("close", async (code) => {
      clearKillTimeout();
      childToKill = null;
      console.log(`child process exited with code ${code}`);
      failedLoad = Math.max(failedLoad, code);
      if (code === 0) {
        await scoreNext(ref, instance);
      } else {
        await closeInstance(instance);
        await loadNext();
      }
    });
  };

  loadNext();
};
