const SUPABASE_URL = 'https://nuqnlzmmnrrodlalijrb.supabase.co';

// Gerencia os acessos "consulta" (somente leitura). Somente o master pode usar.
// Acoes: listar | criar | senha | excluir
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const fim = (status, obj) => { res.statusCode = status; res.end(JSON.stringify(obj)); };

  if (req.method !== 'POST') return fim(405, { error: 'Method not allowed' });

  const anonKey = process.env.SUPABASE_ANON_KEY || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!serviceKey) return fim(500, { error: 'Servidor sem SUPABASE_SERVICE_ROLE_KEY configurada.' });

  const token = (req.headers['authorization'] || '').replace('Bearer ', '');
  if (!token) return fim(401, { error: 'Não autenticado.' });

  let body = '';
  await new Promise(resolve => {
    req.on('data', chunk => { body += chunk; });
    req.on('end', resolve);
  });
  let payload;
  try { payload = JSON.parse(body || '{}'); }
  catch (e) { return fim(400, { error: 'JSON inválido.' }); }

  const svc = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey };

  try {
    const userResp = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: anonKey, Authorization: 'Bearer ' + token }
    });
    if (!userResp.ok) return fim(401, { error: 'Sessão inválida.' });
    const user = await userResp.json();

    const perfilResp = await fetch(SUPABASE_URL + '/rest/v1/perfis?id=eq.' + encodeURIComponent(user.id) + '&select=role', { headers: svc });
    const perfilArr = await perfilResp.json();
    if (!perfilResp.ok || !perfilArr[0] || perfilArr[0].role !== 'master') {
      return fim(403, { error: 'Apenas o administrador pode gerenciar acessos.' });
    }

    const { acao } = payload;

    if (acao === 'listar') {
      const r = await fetch(SUPABASE_URL + '/rest/v1/perfis?role=eq.consulta&select=id,nome,email,criado_em&order=criado_em.asc', { headers: svc });
      const arr = await r.json();
      if (!r.ok) return fim(400, { error: 'Falha ao listar acessos.' });
      return fim(200, { ok: true, acessos: arr });
    }

    if (acao === 'criar') {
      const { username, password, nome } = payload;
      if (!username || !password) return fim(400, { error: 'Informe usuário e senha.' });
      if (String(password).length < 6) return fim(400, { error: 'Senha deve ter ao menos 6 caracteres.' });
      const limpo = String(username).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!limpo) return fim(400, { error: 'Nome de usuário inválido.' });
      const email = limpo + '@estoquemax.internal';
      const createResp = await fetch(SUPABASE_URL + '/auth/v1/admin/users', {
        method: 'POST',
        headers: { ...svc, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { role: 'consulta', nome: (nome || limpo) } })
      });
      const createOut = await createResp.json();
      if (!createResp.ok) {
        return fim(400, { error: createOut.msg || createOut.error_description || createOut.message || 'Falha ao criar usuário.' });
      }
      // garante o perfil correto mesmo que o gatilho tenha usado o padrao
      const fix = await fetch(SUPABASE_URL + '/rest/v1/perfis?id=eq.' + encodeURIComponent(createOut.id), {
        method: 'PATCH',
        headers: { ...svc, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ role: 'consulta', nome: (nome || limpo) })
      });
      if (!fix.ok) return fim(400, { error: 'Usuário criado, mas falhou ao definir o tipo de acesso. Exclua e crie de novo.' });
      return fim(200, { ok: true, id: createOut.id });
    }

    if (acao === 'senha' || acao === 'excluir') {
      const { id, newPassword } = payload;
      if (!id) return fim(400, { error: 'Acesso não informado.' });
      // so mexe em contas do tipo consulta (nunca master/vendedora)
      const alvoResp = await fetch(SUPABASE_URL + '/rest/v1/perfis?id=eq.' + encodeURIComponent(id) + '&select=role', { headers: svc });
      const alvo = await alvoResp.json();
      if (!alvoResp.ok || !alvo[0] || alvo[0].role !== 'consulta') return fim(403, { error: 'Este acesso não é do tipo consulta.' });

      if (acao === 'senha') {
        if (!newPassword || String(newPassword).length < 6) return fim(400, { error: 'Senha deve ter ao menos 6 caracteres.' });
        const r = await fetch(SUPABASE_URL + '/auth/v1/admin/users/' + encodeURIComponent(id), {
          method: 'PUT',
          headers: { ...svc, 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: newPassword })
        });
        if (!r.ok) { const o = await r.json().catch(() => ({})); return fim(400, { error: o.msg || o.message || 'Falha ao trocar a senha.' }); }
        return fim(200, { ok: true });
      }

      const r = await fetch(SUPABASE_URL + '/auth/v1/admin/users/' + encodeURIComponent(id), { method: 'DELETE', headers: svc });
      if (!r.ok) { const o = await r.json().catch(() => ({})); return fim(400, { error: o.msg || o.message || 'Falha ao excluir o acesso.' }); }
      return fim(200, { ok: true });
    }

    return fim(400, { error: 'Ação inválida.' });
  } catch (err) {
    return fim(500, { error: 'Erro interno: ' + err.message });
  }
};
