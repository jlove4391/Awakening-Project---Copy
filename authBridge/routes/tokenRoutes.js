// /authBridge/routes/tokenRoutes.js
import express from 'express';
const router = express.Router();

const tokenStore = {}; // Keyed by userId

router.post('/store', (req, res) => {
  const { userId, accessToken, refreshToken, expiresAt } = req.body;
  if (!userId || !accessToken) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  tokenStore[userId] = { accessToken, refreshToken, expiresAt };
  res.json({ success: true, message: 'Token stored.' });
});

router.get('/:userId', (req, res) => {
  const { userId } = req.params;
  const data = tokenStore[userId];
  if (!data) return res.status(404).json({ error: 'Token not found.' });

  res.json(data);
});

router.post('/refresh', async (req, res) => {
  const { userId, clientId, clientSecret, refreshUrl } = req.body;
  const stored = tokenStore[userId];
  if (!stored?.refreshToken) {
    return res.status(400).json({ error: 'Missing refresh token.' });
  }

  try {
    const response = await fetch(refreshUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: stored.refreshToken,
      }),
    });

    const data = await response.json();

    tokenStore[userId] = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || stored.refreshToken,
      expiresAt: Date.now() + (data.expires_in * 1000),
    };

    res.json({ success: true, newToken: tokenStore[userId] });
  } catch (err) {
    console.error('Token refresh error:', err);
    res.status(500).json({ error: 'Token refresh failed.' });
  }
});

export default router;
