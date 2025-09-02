export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('i') || url.searchParams.get('token') || '';
    const dest = token
      ? `/api/invite/accept?i=${encodeURIComponent(token)}`
      : `/api/invite/accept`;
    res.statusCode = 302;
    res.setHeader('Location', dest);
    res.setHeader('Cache-Control', 'no-store');
    res.end('');
  } catch {
    res.statusCode = 302;
    res.setHeader('Location', '/api/invite/accept');
    res.end('');
  }
}
