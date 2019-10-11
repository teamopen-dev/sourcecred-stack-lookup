'use strict';

const axios = require('axios');
const {example} = require('../index');

// Our "main" function?
// Just want async/await in a scripting context :D
(async () => {
  console.log(await example(axios, {verbose: false}));
})();
