'use strict';

const {example} = require('../index');

// Our "main" function?
// Just want async/await in a scripting context :D
(async () => {
  const results = await example(require('axios'));
  console.log(results);
})();

