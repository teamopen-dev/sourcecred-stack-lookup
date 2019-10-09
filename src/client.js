'use strict';

const {createRemoteClient} = require('./remoteClient');

// Interpretation stuff.
const globalCredOf = users => users.reduce((sum, u) => sum + u.totalCred, 0);
const accumulativeRelativeCred = (fraction, users) => {
  const globalCred = globalCredOf(users);
  const targetAccumulative = globalCred * fraction;
  const selectedUsers = [];
  for(let acc=0, cred=0, i=0; acc < targetAccumulative; i++) {
    const user = users[i];
    selectedUsers.push(user);
    acc += user.totalCred;
  }
  return selectedUsers;
}

const getAllFromPackage = async (pkgData, clientOpts) => {
	const packages = Array.from(new Set([
		...(Object.keys(pkgData.dependencies || {})),
		...(Object.keys(pkgData.devDependencies || {})),
		...(Object.keys(pkgData.peerDependencies || {})),
	]));

	// Get the meta file for looking up which scores are available.
	const remote = createRemoteClient(clientOpts);
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
exports.example = async (clientOpts) => {

	// Take an example file.
	const pkgData = require('../examples/6.package.json');
	const scoreMap = await getAllFromPackage(pkgData, clientOpts);
	console.log(scoreMap.keys());

	// Example interpretation
	for (const [ref, scores] of scoreMap.entries()) {
		const users = scores[1].users;
		const selected = accumulativeRelativeCred(0.4, users);
		const map = new Map(selected.map(u => [u.address[4], u.totalCred]));
		console.log(ref, '40% done by:', map);
	}

};
