// /authBridge/authBridge.js
const express = require('express');
const router = express.Router();
const axios = require('axios');

const tokenStore = {}; // { userId: { accessToken, refreshToken, expiresAt } }

router.post('/store-token', (req, res) => {
  const { userId, accessToken, refreshToken, expiresAt } = req.body;

  if (!userId || !accessToken) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  tokenStore[userId] = { accessToken, refreshToken, expiresAt };
  res.json({ success: true, message: 'Token stored.' });
});

router.get('/get-token/:userId', (req, res) => {
  const { userId } = req.params;
  const tokenData = tokenStore[userId];

  if (!tokenData) {
    return res.status(404).json({ error: 'No token found for user.' });
  }

  res.json(tokenData);
});

// Optional: future-proofing for refresh logic
router.post('/refresh-token', async (req, res) => {
  const { userId, clientId, clientSecret, refreshUrl } = req.body;
  const stored = tokenStore[userId];

  if (!stored?.refreshToken) {
    return res.status(400).json({ error: 'Missing refresh token.' });
  }

  try {
    const result = await axios.post(refreshUrl, {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: stored.refreshToken,
    });

    tokenStore[userId] = {
      accessToken: result.data.access_token,
      refreshToken: result.data.refresh_token || stored.refreshToken,
      expiresAt: Date.now() + (result.data.expires_in * 1000),
    };

    res.json({ success: true, newToken: tokenStore[userId] });
  } catch (err) {
    console.error('Token refresh failed:', err.response?.data || err.message);
    res.status(500).json({ error: 'Token refresh failed.' });
  }
});

module.exports = router;
