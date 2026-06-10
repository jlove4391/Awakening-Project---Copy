const AUTH_TOKEN = process.env.SOVEREIGN_API_TOKEN || 'sovereign-default-token';

function authCheck(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Missing or invalid authorization header' });
  }

  const token = authHeader.split(' ')[1];

  if (token !== AUTH_TOKEN) {
    console.warn(`Unauthorized token attempt: ${token}`);
    return res.status(403).json({ success: false, message: 'Forbidden: Invalid token' });
  }

  next();
}

export default authCheck;
