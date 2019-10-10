'use strict';

const delay = require('delay');
const {Inflate} = require('pako/dist/pako_inflate.js');

const API_URL = 'https://scsl.teamopen.dev/v0/';
const TIMEOUT = 10000;

const hexOf = str => Buffer.from(str, 'utf8').toString('hex');

const axiosReq = axios => (...args) => {
	return axios.apply(null, args).then(res => res.data);
};

const niceChunk = 1024*1024; // 1MB
const makeNice = (FlateType) => async (data, opts) => {
  const flate = new FlateType({
    gzip: true,
    ...(opts || {}),
  });

  for (let i = 0; i < data.length; i += niceChunk) {
    await delay(1);
    flate.push(data.slice(i, i + niceChunk), i + niceChunk >= data.length);
  }

  if (flate.err) throw flate.err;
  return flate.result;
};

const ungzipNice = makeNice(Inflate);

exports.createRemoteClient = (axios, opts) => {
	const {apiURL, verbose} = opts || {};
	const baseURL = API_URL || apiURL;
	const request = axiosReq(axios);

	const getMeta = async () => {
    const res = await request({
      baseURL,
      method: 'get',
      url: 'meta.json.gz',
      timeout: TIMEOUT,
      responseType: 'arraybuffer',
    });
    const start = Date.now();
    const out = JSON.parse(await ungzipNice(res, {to: 'string'}));
    const took = Date.now() - start;
    if(verbose) console.log('gzip', 'meta.json.gz', took);
    return out;
  }

  const getScores = async (sourcecredRef) => {
    const res = await request({
      baseURL,
      method: 'get',
      url: `${hexOf(sourcecredRef)}.json.gz`,
      timeout: TIMEOUT,
      responseType: 'arraybuffer',
    });
    const start = Date.now();
    const out = JSON.parse(await ungzipNice(res, {to: 'string'}));
    const took = Date.now() - start;
    if(verbose) console.log('gzip', `${hexOf(sourcecredRef)}.json.gz`, took);
    return out;
  }

  return {
    getMeta,
    getScores
  };
};
