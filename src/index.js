'use strict';

const {knuthShuffle} = require('knuth-shuffle');
const {sync: rimrafSync} = require('rimraf');
const {sync: mkdirpSync} = require('mkdirp');
const {tmpdir} = require('os');
const {existsSync, writeFileSync, mkdtempSync, createWriteStream, statSync} = require('fs');
const {join: pathJoin, resolve} = require('path');
const {spawnSync, spawn} = require('child_process');

const oneMinute = 60000;
const oneDay = 24 * 3600 * 1000;

const targetLoadTimeMins = 20;
const nodePath = process.argv[0];

const verbose = !!process.env.VERBOSE || false;
const SOURCECRED_GITHUB_TOKEN = process.env.SOURCECRED_GITHUB_TOKEN;
const cliPath = process.env.SOURCECRED_CLI;

// User ID
const idu = spawnSync('id', ['-u']);
if(idu.status > 0) {
	console.warn(idu.stderr.toString());
	throw new Error('Failed to get user ID');
}
const uid = new Number(idu.stdout.toString());

// Locate the supplied package.json
const relPath = process.argv[2];
const absPath = resolve(process.cwd(), relPath);

if(!existsSync(absPath)) {
	throw new Error(`Can't find file: ${absPath}`);
}

if(!absPath.endsWith('package.json')) {
	throw new Error(`You should provide a package.json, got: ${absPath}`);
}

// Read the supplied package json.
const rootPkg = require(absPath);
const deps = new Set([
	...(Object.keys(rootPkg.dependencies || {})),
	...(Object.keys(rootPkg.devDependencies || {}))
]);
if(verbose) {
	console.log('Dependencies:', deps);
}

// Install in a tmp dir.
console.log('Fetching dependency data from NPM');
const installSite = mkdtempSync(pathJoin(tmpdir(), 'stack-lookup-'));
writeFileSync(pathJoin(installSite, 'package.json'), JSON.stringify(rootPkg, null, 2));
const npmRes = spawnSync('npm', ['i', '-f', '--ignore-scripts'], {
	cwd: installSite,
	timeout: oneMinute
});

if(npmRes.status > 0) {
	console.warn(npmRes.stderr.toString());
	throw new Error('Failed NPM install');
} else {
	if(verbose) {
		console.log('NPM:', npmRes.stdout.toString());
		console.warn('NPM WARN:', npmRes.stderr.toString());
	}
}

const ghPattern = new RegExp(/github\.com\/[^\/]+\/[^\/#\?"']+/gi);
const stripGh = str => str.startsWith('github.com/') ? str.slice('github.com/'.length) : str;
const stripGit = str => str.endsWith('.git') ? str.slice(0, '.git'.length * -1) : str;

const depMap = new Map();
for (const dep of deps) {
	const {bugs, homepage, repository, ...depPkg} = require(pathJoin(installSite, 'node_modules', dep, 'package.json'));
	const suspects = JSON.stringify({bugs, homepage, repository});

	const hits = [...suspects.matchAll(ghPattern)].map(m => m[0]);
	const uniqueHits = new Set(hits.map(stripGh).map(stripGit));
	const refs = Array.from(uniqueHits.values());

	if(refs.length === 0) {
		console.warn(`No match for package: ${dep}`);
	}
	if(refs.length > 1) {
		console.warn(`Ambiquous matches for package: ${dep}`, refs);
	}
	if(refs.length === 1) {
		depMap.set(refs[0], dep);
	}
}

console.log(depMap);

// Switch from tmp dir to local data.
rimrafSync(installSite);
const scDir = resolve(process.cwd(), '.sourcecred');
const scoresDir = resolve(process.cwd(), '.scores');
mkdirpSync(scDir);
mkdirpSync(scoresDir);

const hexDepOf = ref => Buffer.from(depMap.get(ref), 'utf8').toString('hex');

// See which files are old enough to warrant reloading.
const oldEnough = new Date(Date.now() - (2 * oneDay));
const reloadSet =
	Array.from(depMap.keys())
	.filter(rl => {
		try {
			const scoresFor = pathJoin(scoresDir, `${hexDepOf(rl)}.json`);
			const stat = statSync(scoresFor);
			return stat.size === 0 || stat.mtime <= oldEnough;
		} catch (e) {
			return true;
		}
	});

knuthShuffle(reloadSet);
console.log('Refs that need reloading:', reloadSet.length);
const perLoad = Math.ceil(oneMinute * targetLoadTimeMins / reloadSet.length);
console.log('Timeout per load:', perLoad);

let spawnQueue = Array.from(reloadSet);
let killTimeout;
let childToKill = null;

const setKillTimeout = () => {
	if(killTimeout) {
		clearTimeout(killTimeout);
	}
	killTimeout = setTimeout(() => {
		childToKill.kill('SIGINT');
		childToKill = null;
	}, perLoad);
};

process.on('SIGINT', () => {
	if(childToKill) {
		console.log('Received SIGINT. Forwarding this to our child process.');
		spawnQueue = [];
		childToKill.kill('SIGINT');
	} else {
		process.exit();
	}
	if(killTimeout) {
		clearTimeout(killTimeout);
	}
});

const scoreNext = (ref) => {
	const dep = depMap.get(ref);
	const output = createWriteStream(pathJoin(scoresDir, `${hexDepOf(ref)}.json`));
	// const scoreSourceCred = spawn('docker', ['run', '--rm', '-i', '-v', `${scDir}:/data`, 'sourcecred/sourcecred:dev', 'scores', ref]);
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
	const ref = spawnQueue.pop();
	if(ref === undefined) {
		if(failedLoad > 0) {
			throw new Error('One of the deps failed to load');
		}

		spawnQueue = Array.from(reloadSet);
		return;
	}

	// const loadSourceCred = spawn('docker', ['run', '--rm', '-i', '-u', uid, '-v', `${scDir}:/data`, '-e', `SOURCECRED_GITHUB_TOKEN=${SOURCECRED_GITHUB_TOKEN}`, 'sourcecred/sourcecred:dev', 'load', ref]);
	const loadSourceCred = spawn(nodePath, [cliPath, 'load', ref], {timeout: perLoad, env: {SOURCECRED_GITHUB_TOKEN, SOURCECRED_DIRECTORY: scDir}});
	childToKill = loadSourceCred;
	setKillTimeout();
	loadSourceCred.stdout.pipe(process.stdout);
	loadSourceCred.stderr.pipe(process.stderr);
	loadSourceCred.on('close', (code) => {
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
