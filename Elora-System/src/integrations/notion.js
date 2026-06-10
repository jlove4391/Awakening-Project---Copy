// /src/integrations/notion.js

const BACKEND_URL = 'http://localhost:4000';

export async function fetchNotionPages() {
  try {
    const res = await fetch(`${BACKEND_URL}/notion/pages`);
    return await res.json();
  } catch (err) {
    console.error('Failed to fetch Notion pages:', err);
    return [];
  }
}
