'use strict';

const delay = require('delay');
const {Deflate, Inflate} = require('pako/dist/pako.js');

const API_URL = 'https://scsl.teamopen.dev/v0/';
const TIMEOUT = 10000;

const hexOf = str => Buffer.from(str, 'utf8').toString('hex');

const axiosReq = axios => (...args) => {
	return axios.apply(null, args).then(res => res.data);
};

const niceChunk = 1024*1024; // 1MB
const gzipNice = async (data, opts) => {
  const deflate = new Deflate({
    gzip: true,
    ...(opts || {}),
  });

  console.log('Deflate Chunks =', Math.ceil(data.length / niceChunk));
  for (let i = 0; i < data.length; i += niceChunk) {
    await delay(1);
    deflate.push(data.slice(i, i + niceChunk), i + niceChunk >= data.length);
  }

  if (deflate.err) throw deflate.err;
  return deflate.result;
};

const ungzipNice = async (data, opts) => {
  const inflate = new Inflate({
    ...(opts || {}),
  });

  console.log('Inflate Chunks =', Math.ceil(data.length / niceChunk));
  for (let i = 0; i < data.length; i += niceChunk) {
    await delay(0);
    inflate.push(data.slice(i, i + niceChunk), i + niceChunk >= data.length);
  }

  if (inflate.err) throw inflate.err;
  return inflate.result;
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
    const pak = await gzipNice(Buffer.from(JSON.stringify(res)));
    const mid = Date.now();
    const out = JSON.parse(await ungzipNice(pak, {to: 'string'}));
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
    const pak = await gzipNice(Buffer.from(JSON.stringify(res)));
    const mid = Date.now();
    const out = JSON.parse(await ungzipNice(pak, {to: 'string'}));
    const took = [mid - start, Date.now() - mid];
    console.log('rezip', took);
    return out;
  }

  return {
    getMeta,
    getScores
  };
};
