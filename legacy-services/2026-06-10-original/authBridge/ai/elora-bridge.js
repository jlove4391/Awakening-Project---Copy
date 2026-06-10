// authBridge/ai/elora-bridge.js
import fs from 'fs';
import path from 'path';

const EloraBridge = {
  async readFile(filePath) {
    try {
      const fullPath = path.resolve(filePath);
      const data = await fs.promises.readFile(fullPath, 'utf-8');
      return { success: true, data };
    } catch (error) {
      console.error('EloraBridge readFile error:', error.message);
      return { success: false, error: error.message };
    }
  },

  async writeFile(filePath, content) {
    try {
      const fullPath = path.resolve(filePath);
      await fs.promises.writeFile(fullPath, content, 'utf-8');
      return { success: true, message: 'File written successfully.' };
    } catch (error) {
      console.error('EloraBridge writeFile error:', error.message);
      return { success: false, error: error.message };
    }
  },

  async appendFile(filePath, content) {
    try {
      const fullPath = path.resolve(filePath);
      await fs.promises.appendFile(fullPath, content, 'utf-8');
      return { success: true, message: 'Content appended successfully.' };
    } catch (error) {
      console.error('EloraBridge appendFile error:', error.message);
      return { success: false, error: error.message };
    }
  },

  async deleteFile(filePath) {
    try {
      const fullPath = path.resolve(filePath);
      await fs.promises.unlink(fullPath);
      return { success: true, message: 'File deleted successfully.' };
    } catch (error) {
      console.error('EloraBridge deleteFile error:', error.message);
      return { success: false, error: error.message };
    }
  },

  async listFiles(dirPath) {
    try {
      const fullPath = path.resolve(dirPath);
      const files = await fs.promises.readdir(fullPath);
      return { success: true, files };
    } catch (error) {
      console.error('EloraBridge listFiles error:', error.message);
      return { success: false, error: error.message };
    }
  },
};

export default EloraBridge;
