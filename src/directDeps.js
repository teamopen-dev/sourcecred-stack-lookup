'use strict';

const {resolve} = require('path');
const {readFile} = require('fs').promises;
const {constants: fsConst} = require('fs');

exports.getDirectDepsFrom = async (relPackageJson) => {

	const absPath = resolve(process.cwd(), relPackageJson);
	if(!absPath.endsWith('package.json')) {
		throw new Error(`You should provide a package.json, got: ${absPath}`);
	}

	// Read the supplied package json.
	const rootPkg = JSON.parse(await readFile(absPath));
	const deps = new Set([
		...(Object.keys(rootPkg.dependencies || {})),
		...(Object.keys(rootPkg.devDependencies || {}))
	]);

	return {deps, rootPkg};
};
