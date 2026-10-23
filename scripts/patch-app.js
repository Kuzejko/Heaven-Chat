const fs = require('fs');
const path = require('path');

const appJsPath = path.resolve(__dirname, '../app.js');
let code = fs.readFileSync(appJsPath, 'utf8');

// Replace the json stripping in app.js
code = code.replace(/let jsonStr = response\.trim\(\);[\s\S]*?jsonStr = jsonStr\.trim\(\);/g, `let jsonStr = response.trim();
    jsonStr = jsonStr.replace(/^\\s*\`\`\`[a-z]*\\n([\\s\\S]*?)\\n\`\`\`\\s*$/i, '$1').trim();`);

fs.writeFileSync(appJsPath, code);
console.log('Patched app.js successfully');
