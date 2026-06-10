// src/utils/FileOpsEngine.js
const fs = window.require ? window.require('fs') : null;
const path = window.require ? window.require('path') : null;

export const createFolder = (folderPath) => {
  try {
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
      return `✅ Folder created: ${folderPath}`;
    } else {
      return `⚠️ Folder already exists: ${folderPath}`;
    }
  } catch (err) {
    return `❌ Error creating folder: ${err.message}`;
  }
};

export const createFile = (filePath, contents = '') => {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, contents, 'utf8');
      return `✅ File created: ${filePath}`;
    } else {
      return `⚠️ File already exists: ${filePath}`;
    }
  } catch (err) {
    return `❌ Error creating file: ${err.message}`;
  }
};

export const writeToFile = (filePath, contents) => {
  try {
    fs.writeFileSync(filePath, contents, 'utf8');
    return `✅ File written: ${filePath}`;
  } catch (err) {
    return `❌ Error writing to file: ${err.message}`;
  }
};
