export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({
    supabaseUrl: 'https://nuqnlzmmnrrodlalijrb.supabase.co',
    supabaseAnon: process.env.SUPABASE_ANON_KEY || ''
  });
}
