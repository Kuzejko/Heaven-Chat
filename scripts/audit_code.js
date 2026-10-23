const fs = require('fs');
const path = require('path');

console.log('=== COMPREHENSIVE STATIC CODE AUDIT ===\n');

// 1. Verify Imports & Exports
const files = [
  'app.js',
  'server.js',
  'js/ui.js',
  'js/config.js',
  'js/state.js',
  'js/wizards.js',
  'js/stemmer.js',
  'services/storage.js',
  'services/openrouter.js',
  'services/promptBuilder.js',
  'services/cardImportService.js',
  'services/lorebook.js',
  'services/ragService.js',
  'services/apiHelper.js',
  'data/defaultCharacters.js'
];

const fileExports = {};
const exportRegex = /export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([a-zA-Z0-9_$]+)|export\s+\{([^}]+)\}/g;

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const content = fs.readFileSync(file, 'utf8');
  fileExports[file] = new Set();
  let match;
  while ((match = exportRegex.exec(content)) !== null) {
    if (match[1]) {
      fileExports[file].add(match[1]);
    } else if (match[2]) {
      const items = match[2].split(',').map(s => {
        const parts = s.trim().split(/\s+as\s+/);
        return (parts[1] || parts[0]).trim();
      }).filter(Boolean);
      items.forEach(it => fileExports[file].add(it));
    }
  }
}

console.log('--- 1. Checking ES Module Imports vs Exports ---');
let brokenImportCount = 0;
const importRegex = /import\s+(?:\{([^}]+)\}|([a-zA-Z0-9_$]+))\s+from\s+["']([^"']+)["']/g;

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const content = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[3];
    if (importPath.startsWith('.')) {
      const targetPath = path.normalize(path.join(path.dirname(file), importPath)).replace(/\\/g, '/');
      if (!fs.existsSync(targetPath)) {
        console.log(`[Missing File] ${file} imports non-existent file: ${targetPath}`);
        brokenImportCount++;
        continue;
      }
      if (match[1]) {
        const namedImports = match[1].split(',').map(s => {
          const parts = s.trim().split(/\s+as\s+/);
          return parts[0].trim();
        }).filter(Boolean);
        for (const name of namedImports) {
          if (fileExports[targetPath] && !fileExports[targetPath].has(name)) {
            console.log(`[Broken Import] In ${file}: imported "${name}" is NOT exported by ${targetPath}!`);
            brokenImportCount++;
          }
        }
      }
    }
  }
}
if (brokenImportCount === 0) {
  console.log('✔ All ES Module imports match exported symbols.');
}

// 2. DOM ID Audit
console.log('\n--- 2. Checking DOM IDs in index.html vs JS ---');
const html = fs.readFileSync('index.html', 'utf8');
const idRegex = /id="([^"]+)"/g;
const idsInHtml = new Set();
let m;
while ((m = idRegex.exec(html)) !== null) {
  idsInHtml.add(m[1]);
}

let missingIdCount = 0;
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const code = fs.readFileSync(file, 'utf8');
  const getElemRegex = /getElementById\s*\(\s*["']([^"']+)["']\s*\)/g;
  while ((m = getElemRegex.exec(code)) !== null) {
    const id = m[1];
    if (!idsInHtml.has(id)) {
      console.log(`[Missing DOM ID] In ${file}: getElementById("${id}") is not in index.html!`);
      missingIdCount++;
    }
  }
}
if (missingIdCount === 0) {
  console.log('✔ All getElementById references exist in index.html.');
}

// 3. Duplicate IDs in HTML
console.log('\n--- 3. Checking Duplicate IDs in index.html ---');
const allIdsList = [];
idRegex.lastIndex = 0;
while ((m = idRegex.exec(html)) !== null) {
  allIdsList.push(m[1]);
}
const idCounts = {};
allIdsList.forEach(id => { idCounts[id] = (idCounts[id] || 0) + 1; });
const duplicateIds = Object.entries(idCounts).filter(([_, count]) => count > 1);
if (duplicateIds.length > 0) {
  duplicateIds.forEach(([id, count]) => console.log(`[Duplicate ID] #${id} appears ${count} times in index.html`));
} else {
  console.log('✔ No duplicate IDs in index.html.');
}

// 4. Check dom.xxx usage in JS files
console.log('\n--- 4. Checking dom.* properties usage vs declaration ---');
const uiCode = fs.readFileSync('js/ui.js', 'utf8');
const domObjMatch = uiCode.match(/export const dom = \{([\s\S]*?)\n\};/);
const declaredDomProps = new Set();
if (domObjMatch) {
  const propRegex = /([a-zA-Z0-9_$]+)\s*:/g;
  let pm;
  while ((pm = propRegex.exec(domObjMatch[1])) !== null) {
    declaredDomProps.add(pm[1]);
  }
}
console.log(`Declared ${declaredDomProps.size} properties on 'dom' object.`);

const domUsageRegex = /dom\.([a-zA-Z0-9_$]+)/g;
let missingDomPropCount = 0;
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const code = fs.readFileSync(file, 'utf8');
  const lines = code.split(/\r?\n/);
  lines.forEach((line, idx) => {
    let um;
    while ((um = domUsageRegex.exec(line)) !== null) {
      const prop = um[1];
      if (!declaredDomProps.has(prop)) {
        console.log(`[Undeclared dom prop] ${file}:${idx + 1}: dom.${prop} -> ${line.trim()}`);
        missingDomPropCount++;
      }
    }
  });
}
if (missingDomPropCount === 0) {
  console.log('✔ All dom.xxx property usages are defined on dom object.');
}

console.log('\n--- 5. Checking state.chatMetadata usage patterns ---');
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const code = fs.readFileSync(file, 'utf8');
  const lines = code.split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (line.includes('state.chatMetadata[')) {
      console.log(`[chatMetadata] ${file}:${idx + 1}: ${line.trim()}`);
    }
  });
}

console.log('\n--- 6. Checking undefined/null DOM guards ---');
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const code = fs.readFileSync(file, 'utf8');
  const lines = code.split(/\r?\n/);
  lines.forEach((line, idx) => {
    // Check for dom.xyz.addEventListener or dom.xyz.value without optional chaining or if (dom.xyz)
    const directAccessMatch = line.match(/dom\.([a-zA-Z0-9_$]+)\.(addEventListener|value|textContent|innerHTML|style|showModal|close|classList|disabled|focus|checked)/);
    if (directAccessMatch) {
      const prop = directAccessMatch[1];
      // Check if previous lines had if (dom.prop) or if current line has if
      if (!line.includes(`if (dom.${prop})`) && !line.includes(`dom.${prop}?`)) {
        console.log(`[Unguarded DOM access] ${file}:${idx + 1}: ${line.trim()}`);
      }
    }
  });
}

console.log('\n=== AUDIT COMPLETE ===');
