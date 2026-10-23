const fs = require('fs');
const path = require('path');
console.log(fs.readdirSync(path.join(__dirname, 'tests', 'e2e')));
