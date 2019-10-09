'use strict';

const {sync: rimrafSync} = require('rimraf');
const {tmpdir} = require('os');
const {writeFile, mkdtemp, readFile} = require('fs').promises;
const {join: pathJoin} = require('path');
const {spawnSync, spawn} = require('child_process');

const oneMinute = 60000;
const ghPattern = new RegExp(/github\.com\/[^\/]+\/[^\/#\?"']+/gi);
const stripGh = str => str.startsWith('github.com/') ? str.slice('github.com/'.length) : str;
const stripGit = str => str.endsWith('.git') ? str.slice(0, '.git'.length * -1) : str;

exports.resolveByNpmInstall = async (deps, rootPkg, {verbose}) => {

	// Install in a tmp dir.
	const installSite = await mkdtemp(pathJoin(tmpdir(), 'stack-lookup-'));
	await writeFile(pathJoin(installSite, 'package.json'), JSON.stringify(rootPkg, null, 2));
	const npmRes = spawnSync('npm', ['i', '--ignore-scripts', '--no-audit'], {
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

	const depMap = new Map();
	for (const dep of deps) {
		try {
			const {bugs, homepage, repository} = JSON.parse(await readFile(pathJoin(installSite, 'node_modules', dep, 'package.json')));
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
				depMap.set(dep, refs[0]);
			}
		} catch (e) {
			console.warn(`Failed to read package.json for package: ${dep}`, e.message || e);
			continue;
		}
	}

	rimrafSync(installSite);

	return depMap;
};
