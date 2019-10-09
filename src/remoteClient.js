'use strict';

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

	const getMeta = () => request({
		baseURL,
		method: 'get',
		url: 'meta.json',
		timeout: TIMEOUT,
	});

	const getScores = (sourcecredRef) => request({
		baseURL,
		method: 'get',
		url: `${hexOf(sourcecredRef)}.json`,
		timeout: TIMEOUT,
	});

	return {
		getMeta,
		getScores
	};
};
