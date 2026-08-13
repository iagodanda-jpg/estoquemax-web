const SUPABASE_URL = 'https://nuqnlzmmnrrodlalijrb.supabase.co';
const BUCKET = 'logos';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const anonKey = process.env.SUPABASE_ANON_KEY || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!serviceKey) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Servidor sem SUPABASE_SERVICE_ROLE_KEY configurada.' }));
    return;
  }

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: 'Não autenticado.' }));
    return;
  }

  let body = '';
  await new Promise(resolve => {
    req.on('data', chunk => { body += chunk; });
    req.on('end', resolve);
  });

  let payload;
  try { payload = JSON.parse(body || '{}'); }
  catch (e) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'JSON inválido.' }));
    return;
  }

  const { filename, contentBase64, contentType } = payload;
  if (!filename || !contentBase64 || !contentType) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Dados incompletos.' }));
    return;
  }
  if (!contentType.startsWith('image/')) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Apenas arquivos de imagem são permitidos.' }));
    return;
  }
  if (contentBase64.length > 4000000) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Imagem muito grande. Envie um arquivo de até ~2MB.' }));
    return;
  }

  try {
    const userResp = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: anonKey, Authorization: 'Bearer ' + token }
    });
    if (!userResp.ok) {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: 'Sessão inválida.' }));
      return;
    }
    const user = await userResp.json();

    const perfilResp = await fetch(SUPABASE_URL + '/rest/v1/perfis?id=eq.' + encodeURIComponent(user.id) + '&select=role', {
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey }
    });
    const perfilArr = await perfilResp.json();
    if (!perfilResp.ok || !perfilArr[0] || perfilArr[0].role !== 'master') {
      res.statusCode = 403;
      res.end(JSON.stringify({ error: 'Apenas o administrador pode alterar a logo.' }));
      return;
    }

    const bucketCheck = await fetch(SUPABASE_URL + '/storage/v1/bucket/' + BUCKET, {
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey }
    });
    if (bucketCheck.status === 404) {
      const createBucketResp = await fetch(SUPABASE_URL + '/storage/v1/bucket', {
        method: 'POST',
        headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true })
      });
      if (!createBucketResp.ok) {
        const errOut = await createBucketResp.text();
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Falha ao criar espaço de armazenamento: ' + errOut }));
        return;
      }
    }

    const extRaw = (filename.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
    const ext = extRaw || 'png';
    const path = 'empresa-' + Date.now() + '.' + ext;
    const bytes = Buffer.from(contentBase64, 'base64');

    const uploadResp = await fetch(SUPABASE_URL + '/storage/v1/object/' + BUCKET + '/' + path, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': contentType, 'x-upsert': 'true' },
      body: bytes
    });
    if (!uploadResp.ok) {
      const errOut = await uploadResp.text();
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Falha ao enviar imagem: ' + errOut }));
      return;
    }

    const publicUrl = SUPABASE_URL + '/storage/v1/object/public/' + BUCKET + '/' + path;
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, url: publicUrl }));
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Erro interno: ' + err.message }));
  }
};
