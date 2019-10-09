'use strict';

const {example} = require('../index');

// Our "main" function?
// Just want async/await in a scripting context :D
(async () => {
  await example(require('axios'));
})();

