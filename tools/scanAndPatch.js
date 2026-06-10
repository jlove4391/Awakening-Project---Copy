/**
 * Dynasty Autonomy Script: scanAndPatch.js + Reporting
 * ----------------------------------------------------
 * Scans all Console JSX files under /Elora-System/src/components
 * Patches missing className="console-panel"
 * Logs actions to patchLog.txt for audit trail.
 */

const fs = require('fs');
const path = require('path');

const COMPONENTS_DIR = path.join(__dirname, '../Elora-System/src/components');
const LOG_PATH = path.join(__dirname, '../patchLog.txt');

const STANDARD_CLASS = 'console-panel';

console.log(`🗂 Scanning Consoles in: ${COMPONENTS_DIR}\n`);

const logEntry = (message) => {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(LOG_PATH, entry, 'utf8');
};

fs.readdir(COMPONENTS_DIR, (err, files) => {
  if (err) {
    console.error(`❌ ERROR: ${err.message}`);
    process.exit(1);
  }

  const jsxFiles = files.filter(f => f.endsWith('Console.jsx'));
  let patchedCount = 0;

  jsxFiles.forEach(file => {
    const filePath = path.join(COMPONENTS_DIR, file);
    let content = fs.readFileSync(filePath, 'utf8');

    const divRegex = /<div\s*([^>]*?)>/;
    const match = content.match(divRegex);

    if (match) {
      const attrs = match[1];
      if (!attrs.includes('className')) {
        const patched = content.replace(divRegex, `<div className="${STANDARD_CLASS}" ${attrs}>`);
        fs.writeFileSync(filePath, patched, 'utf8');

        const msg = `PATCHED: ${file} → added className="${STANDARD_CLASS}"`;
        console.log(`✅ ${msg}`);
        logEntry(msg);
        patchedCount++;
      } else {
        const msg = `OK: ${file} already has a className.`;
        console.log(`✅ ${msg}`);
        logEntry(msg);
      }
    } else {
      const msg = `WARNING: ${file} — no <div> found. Skipped.`;
      console.warn(`⚠️ ${msg}`);
      logEntry(msg);
    }
  });

  const summary = `✨ Finished. Consoles checked: ${jsxFiles.length}, Patched: ${patchedCount}`;
  console.log(`\n${summary}\n`);
  logEntry(summary);
});
