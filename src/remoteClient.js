'use strict';

const API_URL = 'https://scsl.teamopen.dev/v0/';
const TIMEOUT = 10000;

const hexOf = str => Buffer.from(str, 'utf8').toString('hex');

const axiosReq = (...args) => {
	const request = require('axios');
	return request.apply(null, args).then(res => res.data);
};

exports.createRemoteClient = (opts) => {
	const {asyncRequest, apiURL} = opts || {};
	const baseURL = API_URL || apiURL;
	const request = asyncRequest || axiosReq;

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
