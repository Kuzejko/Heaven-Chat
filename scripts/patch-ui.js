const fs = require('fs');
const path = require('path');

const uiJsPath = path.resolve(__dirname, '../js/ui.js');
let code = fs.readFileSync(uiJsPath, 'utf8');

// Replace the traits querySelector bug
code = code.replace(
  `const traits = Array.from(document.querySelectorAll("#characterTraits .trait-tag")).map(t => t.textContent.replace("×", "").trim()).join(", ");`,
  `const traits = dom.characterTraits.value.trim() || "без выраженных черт";`
);

// Add markdown strip and empty check to all res.trim()
code = code.replace(/const res = await sendMessageNonStream\(([\s\S]*?)\);\s+dom\.([a-zA-Z0-9]+)\.value = res\.trim\(\)(.*?);/g, (match, p1, domNode, suffix) => {
  return `const res = await sendMessageNonStream(${p1});
        
        let cleanedRes = res.trim();
        cleanedRes = cleanedRes.replace(/^\\s*\`\`\`[a-z]*\\n([\\s\\S]*?)\\n\`\`\`\\s*$/i, '$1').trim();
        if (!cleanedRes) throw new Error("Модель вернула пустой ответ");
        
        dom.${domNode}.value = cleanedRes${suffix};`;
});

// Also fix characterExampleDialogs which is slightly different
code = code.replace(/dom\.characterExampleDialogs\.value = res\.trim\(\);/g, () => {
  return `let cleanedRes = res.trim();
        cleanedRes = cleanedRes.replace(/^\\s*\`\`\`[a-z]*\\n([\\s\\S]*?)\\n\`\`\`\\s*$/i, '$1').trim();
        if (!cleanedRes) throw new Error("Модель вернула пустой ответ");
        dom.characterExampleDialogs.value = cleanedRes;`;
});

fs.writeFileSync(uiJsPath, code);
console.log('Patched ui.js successfully');
