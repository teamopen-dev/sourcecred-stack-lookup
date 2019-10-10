'use strict';

const {knuthShuffle} = require('knuth-shuffle');
const {spawn} = require('child_process');
const {createWriteStream, readFileSync, writeFileSync} = require('fs');
const {join: pathJoin} = require('path');
const delay = require('delay');
const {gzip} = require('pako');

const oneMinute = 60000;
const hexOf = str => Buffer.from(str, 'utf8').toString('hex');

const maxPerLoad = 10*oneMinute;

exports.startLoadingScores = ({reloadSet, scoresDir, scDir, depMap, nodePath, cliPath, targetLoadTimeMins, meta, SOURCECRED_GITHUB_TOKEN}) => {
  const doneWhen = targetLoadTimeMins * oneMinute + Date.now();
  let spawnQueue = Array.from(knuthShuffle([...reloadSet]));
  let killTimeout;
  let childToKill = null;

  const clearKillTimeout = () => {
    if(killTimeout) {
      clearTimeout(killTimeout);
      killTimeout = null;
    }
  }
  const setKillTimeout = () => {
    clearKillTimeout();
    killTimeout = setTimeout(() => {
      childToKill.kill('SIGINT');
      childToKill = null;
    }, maxPerLoad);
  };

  process.on('SIGINT', () => {
    clearKillTimeout();
    if(childToKill) {
      console.log('Received SIGINT. Forwarding this to our child process.');
      spawnQueue = [];
      childToKill.kill('SIGINT');
    } else {
      process.exit();
    }
  });

  const scoreNext = (ref) => {
    const jsonPath = pathJoin(scoresDir, `${hexOf(ref)}.json`);
    const jsonGzPath = `${jsonPath}.gz`;
    const output = createWriteStream(jsonPath);
    const scoreSourceCred = spawn(nodePath, [cliPath, 'scores', ref], {timeout: oneMinute, env: {SOURCECRED_DIRECTORY: scDir}});
    childToKill = scoreSourceCred;
    scoreSourceCred.stdout.pipe(output);
    scoreSourceCred.stderr.pipe(process.stderr);
    scoreSourceCred.on('close', async (code) => {
      childToKill = null;
      output.end();
      meta.bumpScore(ref);
      console.log(`child process exited with code ${code}`);
      loadNext();

      // Convert to gzip in parallel.
      await delay(0);
      const json = readFileSync(jsonPath);
      await delay(0);
      const jsonGz = gzip(json);
      await delay(0);
      writeFileSync(jsonGzPath, jsonGz);
    });
  };

  let failedLoad = 0;
  const loadNext = () => {
    if(doneWhen <= Date.now()) {
      console.warn('Out of time, returning');
      return;
    }

    const ref = spawnQueue.pop();
    if(ref === undefined) {
      if(failedLoad > 0) {
        console.warn('One of the deps failed to load');
      }
      return;
    }

    const loadSourceCred = spawn(nodePath, [cliPath, 'load', ref], {timeout: maxPerLoad, env: {SOURCECRED_GITHUB_TOKEN, SOURCECRED_DIRECTORY: scDir}});
    childToKill = loadSourceCred;
    setKillTimeout();
    loadSourceCred.stdout.pipe(process.stdout);
    loadSourceCred.stderr.pipe(process.stderr);
    loadSourceCred.on('close', (code) => {
      clearKillTimeout();
      childToKill = null;
      console.log(`child process exited with code ${code}`);
      failedLoad = Math.max(failedLoad, code);
      if(code === 0) {
        scoreNext(ref);
      } else {
        loadNext();
      }
    });
  };

  loadNext();
};
