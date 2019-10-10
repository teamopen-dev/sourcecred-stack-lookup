'use strict';

const {gzip, ungzip} = require('pako/dist/pako.js');

const API_URL = 'https://scsl.teamopen.dev/v0/';
const TIMEOUT = 10000;

const hexOf = str => Buffer.from(str, 'utf8').toString('hex');

const axiosReq = axios => (...args) => {
	return axios.apply(null, args).then(res => res.data);
};

exports.createRemoteClient = (axios, opts) => {
	const {apiURL} = opts || {};
	const baseURL = API_URL || apiURL;
	const request = axiosReq(axios);

	const getMeta = async () => {
    const res = await request({
      baseURL,
      method: 'get',
      url: 'meta.json',
      timeout: TIMEOUT,
    });
    const start = Date.now();
    const pak = gzip(Buffer.from(JSON.stringify(res)));
    const mid = Date.now();
    const out = JSON.parse(ungzip(pak, {to: 'string'}));
    const took = [mid - start, Date.now() - mid];
    console.log('rezip', took);
    return out;
  }

  const getScores = async (sourcecredRef) => {
    const res = await request({
      baseURL,
      method: 'get',
      url: `${hexOf(sourcecredRef)}.json`,
      timeout: TIMEOUT,
    });
    const start = Date.now();
    const pak = gzip(Buffer.from(JSON.stringify(res)));
    const mid = Date.now();
    const out = JSON.parse(ungzip(pak, {to: 'string'}));
    const took = [mid - start, Date.now() - mid];
    console.log('rezip', took);
    return out;
  }

  return {
    getMeta,
    getScores
  };
};
