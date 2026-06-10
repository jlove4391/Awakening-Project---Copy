// authBridge/routes/authRoutes.js
import express from 'express';
import { getAuthUrl, exchangeCodeForTokens } from '../utils/googleClient.js';
import { getToken } from '../utils/tokenStore.js';

const router = express.Router();

/**
 * Start Google OAuth flow
 */
router.get('/start/google', (_req, res) => {
  // This will now dynamically build the redirect_uri from ENV
  const url = getAuthUrl(process.env.GOOGLE_REDIRECT_URI);
  res.json({ url });
});

/**
 * OAuth callback for Google
 */
router.get('/google/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) return res.status(400).json({ ok: false, error });
  if (!code) return res.status(400).json({ ok: false, error: 'Missing code' });

  try {
    const tokens = await exchangeCodeForTokens(code, process.env.GOOGLE_REDIRECT_URI);
    res.json({
      ok: true,
      service: 'google',
      tokens: {
        scope: tokens.scope || null,
        expiry_date: tokens.expiry_date || null,
        token_type: tokens.token_type || null
      }
    });
  } catch (e) {
    console.error('Google token exchange failed:', e);
    res.status(500).json({ ok: false, error: 'Token exchange failed' });
  }
});

/**
 * Status endpoint for linked accounts
 */
router.get('/status', (_req, res) => {
  const g = getToken('google');
  res.json({
    google: g ? {
      linked: true,
      scope: g.scope || null,
      expiry_date: g.expiry_date || null,
      token_type: g.token_type || null
    } : { linked: false }
  });
});

export default router;
