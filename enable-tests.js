const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'tests', 'e2e');
fs.readdirSync(dir).forEach(file => {
  if (file.endsWith('.disabled')) {
    const oldPath = path.join(dir, file);
    const newPath = path.join(dir, file.replace('.disabled', ''));
    console.log('Renaming', file, 'to', file.replace('.disabled', ''));
    if (fs.existsSync(newPath)) {
      fs.unlinkSync(newPath);
    }
    fs.renameSync(oldPath, newPath);
  }
});
