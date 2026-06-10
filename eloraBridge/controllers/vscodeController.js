// controllers/vscodeController.js
const axios = require('axios');

const VS_CODE_TUNNEL = process.env.VSCODE_TUNNEL_URL;
const SECRET = process.env.VSCODE_SECRET;

exports.listFiles = async (req, res) => {
  try {
    const response = await axios.get(`${VS_CODE_TUNNEL}/files`, {
      headers: { 'X-Secret': SECRET },
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getFile = async (req, res) => {
  try {
    const { filename } = req.params;
    const response = await axios.get(`${VS_CODE_TUNNEL}/file/${filename}`, {
      headers: { 'X-Secret': SECRET },
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateFile = async (req, res) => {
  try {
    const { filename } = req.params;
    const response = await axios.post(`${VS_CODE_TUNNEL}/file/${filename}`, req.body, {
      headers: { 'X-Secret': SECRET },
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.runScan = async (req, res) => {
  try {
    const response = await axios.post(`${VS_CODE_TUNNEL}/run-scan`, {}, {
      headers: { 'X-Secret': SECRET },
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
