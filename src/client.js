'use strict';

const {userBusFactor} = require('./interpretationCases');
const {createRemoteClient} = require('./remoteClient');

const getAllFromPackage = async (pkgData, axios, {verbose}) => {
	const packages = Array.from(new Set([
		...(Object.keys(pkgData.dependencies || {})),
		...(Object.keys(pkgData.devDependencies || {})),
		...(Object.keys(pkgData.peerDependencies || {})),
	]));

	// Get the meta file for looking up which scores are available.
	const remote = createRemoteClient(axios, {verbose});
	const meta = await remote.getMeta();
	if(meta.version !== 1) {
		throw new Error('Expecting meta version 1, got:', meta.version);
	}

	// Deduplicates and filters misses.
	const filtered = packages.map(p => meta.packageRefs[p]).filter(r => !!r);
	const uniqueRefs = Array.from(new Set(filtered));
	const usableRefs = uniqueRefs.filter(r => !!meta.sourceCredRefs[r]);

	// Fetches all available scores relevant for this package.json.
	const resolvedRefs = new Map(await Promise.all(
		usableRefs.map(async (r) => {
			const scores = await remote.getScores(r);
			return [r, scores];
		})
	));

	return resolvedRefs;
};

// Start running as async.
const example = async (axios, opts) => {
  const {verbose} = opts || {verbose: true};

	// Take an example file.
	const pkgData = require('../examples/6.package.json');
  const start = Date.now();
	const scoreMap = await getAllFromPackage(pkgData, axios, {verbose});
  const mid = Date.now();
  if(verbose) console.log('Getting packages', mid - start);

	// Example interpretation
  const results = userBusFactor(scoreMap);
  if(verbose) console.log('Interpretation', Date.now() - mid);

  return results;
};

module.exports = {
  userBusFactor,
  getAllFromPackage,
  example,
};
