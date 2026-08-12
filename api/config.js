module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    supabaseUrl: 'https://nuqnlzmmnrrodlalijrb.supabase.co',
    supabaseAnon: process.env.SUPABASE_ANON_KEY || ''
  }));
};
