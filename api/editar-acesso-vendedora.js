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

  const { vendedoraId, newUsername, newPassword } = payload;
  if (!vendedoraId || (!newUsername && !newPassword)) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Informe pelo menos um novo usuário ou nova senha.' }));
    return;
  }
  if (newPassword && String(newPassword).length < 6) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Senha deve ter ao menos 6 caracteres.' }));
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
      res.end(JSON.stringify({ error: 'Apenas o administrador pode alterar acessos.' }));
      return;
    }

    const vendResp = await fetch(SUPABASE_URL + '/rest/v1/vendedoras?id=eq.' + encodeURIComponent(vendedoraId) + '&select=perfil_id,nome', {
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey }
    });
    const vendArr = await vendResp.json();
    if (!vendResp.ok || !vendArr[0] || !vendArr[0].perfil_id) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Essa vendedora ainda não tem acesso criado.' }));
      return;
    }
    const perfilId = vendArr[0].perfil_id;

    const updatePayload = {};
    if (newUsername) {
      const email = String(newUsername).trim().toLowerCase().replace(/[^a-z0-9]/g, '') + '@estoquemax.internal';
      if (email === '@estoquemax.internal') {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Nome de usuário inválido.' }));
        return;
      }
      updatePayload.email = email;
      updatePayload.email_confirm = true;
    }
    if (newPassword) {
      updatePayload.password = newPassword;
    }

    const updateResp = await fetch(SUPABASE_URL + '/auth/v1/admin/users/' + encodeURIComponent(perfilId), {
      method: 'PUT',
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload)
    });
    const updateOut = await updateResp.json();
    if (!updateResp.ok) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: updateOut.msg || updateOut.error_description || updateOut.message || 'Falha ao atualizar acesso.' }));
      return;
    }

    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Erro interno: ' + err.message }));
  }
};
