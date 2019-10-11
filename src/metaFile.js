'use strict';

const {gzip, ungzip} = require('pako');
const {join: pathJoin} = require('path');
const {readFile, writeFile} = require('fs').promises;
const {sortObjByVal} = require('./util');

exports.createMetaFileHandle = async (dir, {verbose}) => {
  const metaPath = pathJoin(dir, 'meta.json');
  const metaGzPath = pathJoin(dir, 'meta.json.gz');
  const meta = {
    version: 1,
    sourceCredRefs: {},
    packageRefs: {}
  };

  const tryLoad = async () => {
    try {
      const metaData = JSON.parse(ungzip(await readFile(metaGzPath), {to: 'string'}));
      if(metaData.version === 1){
        const {packageRefs, sourceCredRefs} = metaData;
        meta.packageRefs = packageRefs;
        for (const ref in sourceCredRefs) {
          meta.sourceCredRefs[ref] = new Date(sourceCredRefs[ref]);
        }
      }
    } catch(e) {
      if(e.code == 'ENOENT') return;
      console.warn('Problem loading metadata', e);
    }
  };

  const flush = async () => {
    try {
      const json = JSON.stringify(meta, null, 2);
      const jsonGz = gzip(json);
      await writeFile(metaPath, json);
      await writeFile(metaGzPath, jsonGz);
    } catch(e) {
      if(verbose) console.warn('Problem flushing metadata', e);
    }
  };

  const storePackageRefs = async (packageMap) => {
    const refs = {};
    for (const [k, v] of packageMap.entries()) {
      refs[k] = v;
    }
    meta.packageRefs = sortObjByVal({...meta.packageRefs, ...refs}, true);
    await flush();
  };

  const bumpScore = async (ref) => {
    meta.sourceCredRefs = sortObjByVal({...meta.sourceCredRefs, [ref]: new Date()}, false);
    await flush();
  };

  const packageHasAge = (dep, age) => {
    const targetDate = new Date(Date.now() - age);
    const foundRef = meta.packageRefs[dep];
    const foundDate = foundRef && meta.sourceCredRefs[foundRef] || null;
    if(verbose) console.log('Comparing for age', dep, !foundDate, foundDate <= targetDate);
    return !foundDate || foundDate <= targetDate;
  };

  // Deduplicates and filters misses.
  const packagesToRefs = (packages) => {
    const filtered = packages.map(p => meta.packageRefs[p]).filter(r => !!r);
    return Array.from(new Set(filtered))
  };

  await tryLoad();

  return {
    packageHasAge,
    bumpScore,
    storePackageRefs,
    packagesToRefs
  };

};
