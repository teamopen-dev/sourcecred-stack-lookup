'use strict';

const {join: pathJoin} = require('path');
const {readFile, writeFile} = require('fs').promises;

exports.createMetaFileHandle = async (dir, {verbose}) => {
	const metaPath = pathJoin(dir, 'meta.json');
	const meta = {};
	
	const tryLoad = async () => {
		try {
			const metaData = JSON.parse(await readFile(metaPath));
			for (const dep in metaData) {
				meta[dep] = new Date(metaData[dep]);
			}
		} catch(e) {
			if(e.code == 'ENOENT') return;
			if(verbose) console.warn('Problem loading metadata', e);
		}
	};

	const flush = async () => {
		try {
			await writeFile(metaPath, JSON.stringify(meta, null, 2));
		} catch(e) {
			if(verbose) console.warn('Problem flushing metadata', e);
		}
	};

	const bumpScore = async (npmName) => {
		meta[npmName] = new Date();
		await flush();
	};

	const hasAge = (dep, age) => {
		const targetDate = new Date(Date.now() - age);
		const foundDate = meta[dep] || null;
		if(verbose) console.log('Comparing for age', dep, !foundDate, foundDate <= targetDate);
		return !foundDate || foundDate <= targetDate;
	};

	await tryLoad();

	return {
		hasAge,
		bumpScore
	};

};
