const SUPABASE_URL = 'https://nuqnlzmmnrrodlalijrb.supabase.co';

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

  const { email, password, vendedoraId } = payload;
  if (!email || !password || !vendedoraId) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Dados incompletos.' }));
    return;
  }
  if (String(password).length < 6) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Senha deve ter ao menos 6 caracteres.' }));
    return;
  }

  try {
    // valida quem esta chamando (o token do usuario logado no master.html)
    const userResp = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: anonKey, Authorization: 'Bearer ' + token }
    });
    if (!userResp.ok) {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: 'Sessão inválida.' }));
      return;
    }
    const user = await userResp.json();

    // confirma que quem esta chamando e master (usando a service key, ignora RLS)
    const perfilResp = await fetch(SUPABASE_URL + '/rest/v1/perfis?id=eq.' + encodeURIComponent(user.id) + '&select=role', {
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey }
    });
    const perfilArr = await perfilResp.json();
    if (!perfilResp.ok || !perfilArr[0] || perfilArr[0].role !== 'master') {
      res.statusCode = 403;
      res.end(JSON.stringify({ error: 'Apenas o administrador pode criar acessos.' }));
      return;
    }

    // cria o usuario no Supabase Auth via Admin API
    const createResp = await fetch(SUPABASE_URL + '/auth/v1/admin/users', {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, email_confirm: true })
    });
    const createOut = await createResp.json();
    if (!createResp.ok) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: createOut.msg || createOut.error_description || createOut.message || 'Falha ao criar usuário.' }));
      return;
    }

    // vincula o novo usuario a vendedora
    const linkResp = await fetch(SUPABASE_URL + '/rest/v1/vendedoras?id=eq.' + encodeURIComponent(vendedoraId), {
      method: 'PATCH',
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ perfil_id: createOut.id })
    });
    if (!linkResp.ok) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Usuário criado, mas falhou ao vincular à vendedora.' }));
      return;
    }

    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, perfilId: createOut.id }));
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Erro interno: ' + err.message }));
  }
};
