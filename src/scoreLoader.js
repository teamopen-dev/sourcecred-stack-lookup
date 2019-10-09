'use strict';

const {knuthShuffle} = require('knuth-shuffle');
const {spawn} = require('child_process');
const {createWriteStream} = require('fs');
const {join: pathJoin} = require('path');

const oneMinute = 60000;
const hexOf = str => Buffer.from(str, 'utf8').toString('hex');

exports.startLoadingScores = ({reloadSet, scoresDir, scDir, depMap, nodePath, cliPath, perLoad, meta, SOURCECRED_GITHUB_TOKEN}) => {
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
		}, perLoad);
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

	const scoreNext = (dep, ref) => {
		const output = createWriteStream(pathJoin(scoresDir, `${hexOf(dep)}.json`));
		const scoreSourceCred = spawn(nodePath, [cliPath, 'scores', ref], {timeout: oneMinute, env: {SOURCECRED_DIRECTORY: scDir}});
		childToKill = scoreSourceCred;
		scoreSourceCred.stdout.pipe(output);
		scoreSourceCred.stderr.pipe(process.stderr);
		scoreSourceCred.on('close', (code) => {
			childToKill = null;
			output.end();
			meta.bumpScore(dep);
			console.log(`child process exited with code ${code}`);
			loadNext();
		});
	};

	let failedLoad = 0;
	const loadNext = () => {
		const dep = spawnQueue.pop();
		if(dep === undefined) {
			if(failedLoad > 0) {
				console.warn('One of the deps failed to load');
			}
			return;
		}

		const ref = depMap.get(dep);
		if(!ref) {
			console.warn('No known GitHub project for package:', dep);
			loadNext();
			return;
		}

		const loadSourceCred = spawn(nodePath, [cliPath, 'load', ref], {timeout: perLoad, env: {SOURCECRED_GITHUB_TOKEN, SOURCECRED_DIRECTORY: scDir}});
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
				scoreNext(dep, ref);
			} else {
				loadNext();
			}
		});
	};

	loadNext();
};
