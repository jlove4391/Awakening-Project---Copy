// /src/utils/tokenManager.js

const API_BASE = "http://localhost:5050/api/token"; // Your backend

export async function storeToken(userId, accessToken, refreshToken, expiresAt) {
  try {
    const res = await fetch(`${API_BASE}/store`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, accessToken, refreshToken, expiresAt }),
    });
    return await res.json();
  } catch (err) {
    console.error("❌ Token store failed:", err);
    return null;
  }
}

export async function getStoredToken(userId) {
  try {
    const res = await fetch(`${API_BASE}/${userId}`);
    if (!res.ok) throw new Error("Token not found");
    return await res.json();
  } catch (err) {
    console.error("❌ Get token failed:", err);
    return null;
  }
}

export async function refreshToken(userId, clientId, clientSecret, refreshUrl) {
  try {
    const res = await fetch(`${API_BASE}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, clientId, clientSecret, refreshUrl }),
    });
    return await res.json();
  } catch (err) {
    console.error("❌ Refresh token failed:", err);
    return null;
  }
}
