'use strict';

const {knuthShuffle} = require('knuth-shuffle');
const {sync: mkdirpSync} = require('mkdirp');
const {tmpdir} = require('os');
const {existsSync, writeFileSync, mkdtempSync, createWriteStream, statSync} = require('fs');
const {join: pathJoin, resolve} = require('path');
const {spawnSync, spawn} = require('child_process');

const {getDirectDepsFrom} = require('./directDeps');
const {resolveByNpmInstall} = require('./ghResolver');

const oneMinute = 60000;
const oneDay = 24 * 3600 * 1000;

const targetLoadTimeMins = 40;
const nodePath = process.argv[0];

const verbose = !!process.env.VERBOSE || false;
const SOURCECRED_GITHUB_TOKEN = process.env.SOURCECRED_GITHUB_TOKEN;
const cliPath = process.env.SOURCECRED_CLI;

const hexOf = str => Buffer.from(str, 'utf8').toString('hex');

// Our "main" function?
// Just want async/await in a scripting context :D
(async () => {

	// Locate the supplied package.json
	const relPath = process.argv[2];
	const {deps, rootPkg} = await getDirectDepsFrom(relPath);
	if(verbose) console.log('Dependencies:', deps);

	// Switch from tmp dir to local data.
	const scDir = resolve(process.cwd(), '.sourcecred');
	const scoresDir = resolve(process.cwd(), '.scores');
	mkdirpSync(scDir);
	mkdirpSync(scoresDir);

	// Find out which we need to reload.
	const oldEnough = new Date(Date.now() - (2 * oneDay));
	const reloadSetNpm =
		Array.from(deps.values())
		.filter(npmName => {
			try {
				const scoresFor = pathJoin(scoresDir, `${hexOf(npmName)}.json`);
				const stat = statSync(scoresFor);
				return stat.size === 0 || stat.mtime <= oldEnough;
			} catch (e) {
				return true;
			}
		});

	console.log('Refs that need reloading:', reloadSetNpm.length);
	const perLoad = Math.ceil(oneMinute * targetLoadTimeMins / reloadSetNpm.length);
	console.log('Timeout per load:', perLoad);

	// Install in a tmp dir.
	console.log('Fetching dependency data from NPM');
	const depMap = await resolveByNpmInstall(deps, rootPkg, {verbose});
	if(verbose) console.log(depMap);

	let spawnQueue = Array.from(knuthShuffle([...reloadSetNpm]));
	let killTimeout;
	let childToKill = null;

	const clearKillTimeout = () => {
		if(killTimeout) {
			clearTimeout(killTimeout);
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

})();
