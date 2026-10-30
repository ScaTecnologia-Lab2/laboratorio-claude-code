// ============================================================================
// painel/servidor.js — Painel de Aprendizado do LabSystem
// ----------------------------------------------------------------------------
//   node painel/servidor.js        →  http://localhost:3100
//
// Mostra containers (Docker), Kubernetes (pods, nós, serviços) e oferece um
// console SQL para o banco. Roda NO SEU COMPUTADOR, fora dos containers, porque
// precisa dos comandos `docker` e `kubectl` — dar acesso ao Docker para dentro
// de um container equivaleria a entregar a máquina inteira a quem invadisse o app.
//
// Segurança (tudo no servidor, nunca só no navegador):
//   • escuta só em 127.0.0.1 — outros computadores da rede não alcançam;
//   • confere Host e Origin e exige o cabeçalho X-Painel — um site aberto no
//     seu navegador não consegue mandar comandos para o painel;
//   • nomes de container/pod e namespaces são validados (painel/lib.js);
//   • os comandos usam execFile (sem shell): nada do navegador vira texto de comando;
//   • o console SQL começa em modo SOMENTE LEITURA e mostra uma instrução por vez.
// Sem dependências novas: só módulos nativos do Node e o `pg` que já existe.
// ============================================================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { Client } = require('pg');
const lib = require('./lib');

const PORTA = Number(process.env.PAINEL_PORT || 3100);
const PUBLIC = path.join(__dirname, 'public');
const CSS_DO_APP = path.join(__dirname, '..', 'src', 'public', 'css', 'styles.css');

// Mesmas variáveis e padrões de src/db.js: sem Docker o banco está em localhost:5151.
const DB = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5151),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '5151',
  database: process.env.DB_NAME || 'laboratorio',
};

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json',
};

// ── Utilidades ──────────────────────────────────────────────────────────────

function responder(res, status, dados) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(dados));
}

function lerBody(req, limite = 100 * 1024) {
  return new Promise((resolve, reject) => {
    let corpo = '';
    req.on('data', c => {
      corpo += c;
      if (corpo.length > limite) { reject(new Error('Corpo grande demais')); req.destroy(); }
    });
    req.on('end', () => { try { resolve(corpo ? JSON.parse(corpo) : {}); } catch { reject(new Error('JSON inválido')); } });
  });
}

// Roda um programa SEM shell. kubectl/k3d ficam em ~/.local/bin (ver CLAUDE.md).
function executar(cmd, args, timeout = 20000) {
  const env = { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}` };
  return new Promise(resolve => {
    execFile(cmd, args, { timeout, maxBuffer: 8 * 1024 * 1024, env }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        out: stdout || '',
        err: (stderr || '').trim() || (err ? err.message : ''),
        naoInstalado: !!(err && err.code === 'ENOENT'),
      });
    });
  });
}

function linhasJson(texto) {
  return texto.split('\n').filter(Boolean).map(l => JSON.parse(l));
}

function falhaDocker(res, r) {
  responder(res, 503, {
    erro: r.naoInstalado ? 'O comando docker não foi encontrado.' : 'Não consegui falar com o Docker.',
    detalhe: r.err,
    dica: 'Confira no terminal: docker ps. Se pedir permissão, seu usuário precisa estar no grupo docker.',
  });
}

function falhaKubectl(res, r) {
  responder(res, 503, {
    erro: r.naoInstalado ? 'O comando kubectl não foi encontrado.' : 'Não consegui falar com o cluster Kubernetes.',
    detalhe: r.err,
    dica: 'O cluster está de pé? Crie com: sh scripts/k8s/criar-cluster.sh (kubectl fica em ~/.local/bin).',
  });
}

// ── Containers (Docker) ─────────────────────────────────────────────────────

async function containers(res) {
  const [ps, stats] = await Promise.all([
    executar('docker', ['ps', '-a', '--format', '{{json .}}']),
    executar('docker', ['stats', '--no-stream', '--format', '{{json .}}'], 30000),
  ]);
  if (!ps.ok) return falhaDocker(res, ps);

  const uso = {};
  if (stats.ok) for (const s of linhasJson(stats.out)) uso[s.Name] = s;

  const lista = linhasJson(ps.out).map(c => {
    const etiqueta = chave => ((c.Labels || '').match(new RegExp(`${chave}=([^,]+)`)) || [])[1] || null;
    const projeto = etiqueta('com.docker.compose.project');
    const u = uso[c.Names] || {};
    return {
      id: c.ID.slice(0, 12),
      nome: c.Names,
      imagem: c.Image,
      estado: c.State,
      status: c.Status,
      saude: lib.saudeContainer(c.State, c.Status),
      portas: c.Ports || '',
      grupo: c.Names.startsWith('k3d-') ? 'k3d' : (projeto ? `compose:${projeto}` : 'outros'),
      servico: etiqueta('com.docker.compose.service'),
      cpu: u.CPUPerc || null,
      memoria: u.MemUsage || null,
      memoriaPct: u.MemPerc || null,
      rede: u.NetIO || null,
      processos: u.PIDs || null,
    };
  });
  responder(res, 200, { containers: lista });
}

async function logsContainer(res, qs) {
  const nome = qs.get('nome');
  if (!lib.nomeValido(nome)) return responder(res, 400, { erro: 'Nome de container inválido' });
  const r = await executar('docker', ['logs', '--tail', String(lib.limitarTail(qs.get('tail'))), '--timestamps', nome]);
  if (!r.ok) return responder(res, 502, { erro: 'Não consegui ler os logs', detalhe: r.err });
  // O docker separa stdout e stderr; juntar e ordenar pelo carimbo de hora restaura a ordem.
  const texto = (r.out + (r.err ? '\n' + r.err : '')).split('\n').filter(Boolean).sort().join('\n');
  responder(res, 200, { nome, logs: texto });
}

// ── Kubernetes ──────────────────────────────────────────────────────────────

function papelDoNo(labels) {
  return Object.keys(labels || {}).filter(k => k.startsWith('node-role.kubernetes.io/'))
    .map(k => k.split('/')[1]).join(',') || 'worker';
}

function kiParaMi(valor) {
  const m = /^(\d+)Ki$/.exec(valor || '');
  return m ? `${Math.round(Number(m[1]) / 1024)} MiB` : (valor || '-');
}

function tabelaTop(texto) {
  const mapa = {};
  for (const l of texto.split('\n').filter(Boolean)) {
    const c = l.trim().split(/\s+/);
    mapa[c[0]] = c.slice(1);
  }
  return mapa;
}

async function kubernetes(res, qs) {
  const ns = qs.get('ns');
  if (!lib.namespaceValido(ns)) return responder(res, 400, { erro: `Namespace inválido. Use: ${lib.NAMESPACES.join(' ou ')}` });

  const [nos, objetos, topNos, topPods] = await Promise.all([
    executar('kubectl', ['get', 'nodes', '-o', 'json']),
    executar('kubectl', ['get', 'pods,deployments,statefulsets,services,hpa', '-n', ns, '-o', 'json']),
    executar('kubectl', ['top', 'nodes', '--no-headers']),
    executar('kubectl', ['top', 'pods', '-n', ns, '--no-headers']),
  ]);
  if (!nos.ok) return falhaKubectl(res, nos);
  if (!objetos.ok) return falhaKubectl(res, objetos);

  const usoNos = topNos.ok ? tabelaTop(topNos.out) : {};
  const usoPods = topPods.ok ? tabelaTop(topPods.out) : {};
  const itens = JSON.parse(objetos.out).items;
  const tipo = k => itens.filter(i => i.kind === k);

  const pods = tipo('Pod').map(p => {
    const r = lib.resumirPod(p);
    const u = usoPods[r.nome] || [];
    return { ...r, cpu: u[0] || null, memoria: u[1] || null };
  });

  responder(res, 200, {
    namespace: ns,
    metricas: topPods.ok,
    nos: JSON.parse(nos.out).items.map(n => {
      const u = usoNos[n.metadata.name] || [];
      const pronto = (n.status.conditions || []).find(c => c.type === 'Ready');
      const ip = (n.status.addresses || []).find(a => a.type === 'InternalIP');
      return {
        nome: n.metadata.name,
        papel: papelDoNo(n.metadata.labels),
        pronto: !!pronto && pronto.status === 'True',
        versao: n.status.nodeInfo.kubeletVersion,
        ip: ip ? ip.address : '-',
        cpuTotal: n.status.capacity.cpu,
        memoriaTotal: kiParaMi(n.status.capacity.memory),
        cpuUso: u[0] || null, cpuPct: u[1] || null, memoriaUso: u[2] || null, memoriaPct: u[3] || null,
        idade: lib.idade(n.metadata.creationTimestamp),
      };
    }),
    pods,
    deployments: tipo('Deployment').map(d => ({
      nome: d.metadata.name,
      desejadas: d.spec.replicas ?? 1,
      prontas: d.status.readyReplicas || 0,
      atualizadas: d.status.updatedReplicas || 0,
      disponiveis: d.status.availableReplicas || 0,
      imagem: d.spec.template.spec.containers[0].image,
      estrategia: d.spec.strategy ? d.spec.strategy.type : '-',
      idade: lib.idade(d.metadata.creationTimestamp),
    })),
    statefulsets: tipo('StatefulSet').map(s => ({
      nome: s.metadata.name,
      desejadas: s.spec.replicas ?? 1,
      prontas: s.status.readyReplicas || 0,
      imagem: s.spec.template.spec.containers[0].image,
      idade: lib.idade(s.metadata.creationTimestamp),
    })),
    servicos: tipo('Service').map(s => ({
      nome: s.metadata.name,
      tipo: s.spec.type,
      ipInterno: s.spec.clusterIP,
      portas: (s.spec.ports || []).map(p => `${p.port}→${p.targetPort}${p.nodePort ? ` (nodePort ${p.nodePort})` : ''}`).join(', '),
      externo: ((s.status.loadBalancer && s.status.loadBalancer.ingress) || []).map(i => i.ip || i.hostname).join(', ') || '-',
      idade: lib.idade(s.metadata.creationTimestamp),
    })),
    hpas: tipo('HorizontalPodAutoscaler').map(h => {
      const cpu = m => m && m.resource && m.resource.name === 'cpu';
      const atual = ((h.status.currentMetrics || []).find(cpu) || {}).resource;
      const alvo = ((h.spec.metrics || []).find(cpu) || {}).resource;
      return {
        nome: h.metadata.name,
        alvo: h.spec.scaleTargetRef.name,
        min: h.spec.minReplicas ?? 1,
        max: h.spec.maxReplicas,
        atuais: h.status.currentReplicas ?? 0,
        desejadas: h.status.desiredReplicas ?? 0,
        cpuAtual: atual ? atual.current.averageUtilization : null,
        cpuAlvo: alvo ? alvo.target.averageUtilization : null,
      };
    }),
  });
}

async function logsPod(res, qs) {
  const ns = qs.get('ns');
  const pod = qs.get('pod');
  if (!lib.namespaceValido(ns)) return responder(res, 400, { erro: 'Namespace inválido' });
  if (!lib.nomeValido(pod)) return responder(res, 400, { erro: 'Nome de pod inválido' });
  const r = await executar('kubectl', ['logs', pod, '-n', ns, '--tail', String(lib.limitarTail(qs.get('tail'))), '--timestamps', '--all-containers']);
  if (!r.ok) return responder(res, 502, { erro: 'Não consegui ler os logs do pod', detalhe: r.err });
  responder(res, 200, { pod, logs: r.out.trimEnd() });
}

async function eventosK8s(res, qs) {
  const ns = qs.get('ns');
  if (!lib.namespaceValido(ns)) return responder(res, 400, { erro: 'Namespace inválido' });
  const r = await executar('kubectl', ['get', 'events', '-n', ns, '-o', 'json']);
  if (!r.ok) return falhaKubectl(res, r);
  const momento = e => e.lastTimestamp || e.eventTime || e.metadata.creationTimestamp;
  const eventos = JSON.parse(r.out).items
    .sort((a, b) => new Date(momento(b)) - new Date(momento(a)))
    .slice(0, 40)
    .map(e => ({
      tipo: e.type,
      motivo: e.reason,
      objeto: `${e.involvedObject.kind}/${e.involvedObject.name}`,
      mensagem: e.message,
      vezes: e.count || 1,
      idade: lib.idade(momento(e)),
    }));
  responder(res, 200, { namespace: ns, eventos });
}

// ── Banco de dados (console SQL) ────────────────────────────────────────────

async function conectar() {
  const client = new Client({ ...DB, connectionTimeoutMillis: 3000 });
  await client.connect();
  return client;
}

function erroDeBanco(res, e) {
  if (['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'].includes(e.code) || (/terminated|timeout/i.test(e.message) && !e.code)) {
    return responder(res, 503, {
      erro: `Não consegui conectar ao banco em ${DB.host}:${DB.port}.`,
      detalhe: e.message,
      dica: 'O container do Postgres está de pé? Tente: docker compose up -d postgres (porta 5151). Para outro endereço use DB_HOST/DB_PORT ao iniciar o painel.',
    });
  }
  const dicas = {
    '25006': 'Você está no modo SOMENTE LEITURA. Para testar uma escrita sem gravar escolha "Simular"; para gravar de verdade escolha "Gravar".',
    '42P01': 'Essa tabela não existe. Veja a lista de tabelas ao lado.',
    '42703': 'Essa coluna não existe na tabela. Veja as colunas na lista ao lado.',
    '42601': 'Erro de sintaxe: confira vírgulas, aspas e palavras-chave.',
    '57014': 'A consulta passou de 10 segundos e foi cancelada.',
  };
  // O painel roda UMA instrução por vez (é o que impede escapar do modo somente leitura).
  const dica = /multiple commands/.test(e.message)
    ? 'O painel executa uma instrução SQL por vez. Rode cada comando separadamente (sem ";" no meio).'
    : dicas[e.code] || null;
  responder(res, 400, { erro: e.message, codigo: e.code || null, posicao: e.position ? Number(e.position) : null, dica });
}

async function esquema(res) {
  let client;
  try {
    client = await conectar();
    await client.query('BEGIN READ ONLY');
    const colunas = await client.query(`
      SELECT c.table_name AS tabela, c.column_name AS coluna, c.data_type AS tipo,
             (c.is_nullable = 'YES') AS aceita_nulo, c.column_default AS padrao,
             EXISTS (SELECT 1 FROM information_schema.table_constraints tc
                       JOIN information_schema.key_column_usage k
                         ON k.constraint_name = tc.constraint_name AND k.table_schema = tc.table_schema
                      WHERE tc.constraint_type = 'PRIMARY KEY' AND k.table_schema = c.table_schema
                        AND k.table_name = c.table_name AND k.column_name = c.column_name) AS chave_primaria
        FROM information_schema.columns c
        JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
       WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
       ORDER BY c.table_name, c.ordinal_position`);
    const tabelas = {};
    for (const c of colunas.rows) {
      (tabelas[c.tabela] = tabelas[c.tabela] || { nome: c.tabela, colunas: [], linhas: null }).colunas.push({
        nome: c.coluna, tipo: c.tipo, aceitaNulo: c.aceita_nulo, padrao: c.padrao, chavePrimaria: c.chave_primaria,
      });
    }
    // O nome vem do catálogo do próprio banco; escapeIdentifier protege mesmo assim.
    for (const t of Object.values(tabelas)) {
      const r = await client.query(`SELECT count(*)::int AS n FROM ${client.escapeIdentifier(t.nome)}`);
      t.linhas = r.rows[0].n;
    }
    await client.query('ROLLBACK');
    responder(res, 200, { banco: `${DB.host}:${DB.port}/${DB.database}`, tabelas: Object.values(tabelas) });
  } catch (e) {
    erroDeBanco(res, e);
  } finally {
    if (client) await client.end().catch(() => {});
  }
}

async function executarSql(req, res) {
  let corpo;
  try { corpo = await lerBody(req); } catch (e) { return responder(res, 400, { erro: e.message }); }
  const sql = typeof corpo.sql === 'string' ? corpo.sql.trim() : '';
  if (!sql) return responder(res, 400, { erro: 'Digite uma instrução SQL.' });
  if (!lib.modoValido(corpo.modo)) return responder(res, 400, { erro: `Modo inválido. Use: ${lib.MODOS_SQL.join(', ')}` });
  const bloqueio = lib.sqlBloqueado(sql);
  if (bloqueio) return responder(res, 400, { erro: `Bloqueado pelo painel: ${bloqueio}.`, dica: 'Use SELECT, INSERT, UPDATE, DELETE, CREATE… sobre as tabelas do banco.' });

  let client;
  try {
    client = await conectar();
    const inicio = Date.now();
    // "leitura": o PRÓPRIO Postgres recusa qualquer escrita. "simular": escreve, mas termina em ROLLBACK.
    await client.query(corpo.modo === 'leitura' ? 'BEGIN READ ONLY' : 'BEGIN');
    await client.query('SET LOCAL statement_timeout = 10000');
    let r;
    try {
      // `name` faz o pg usar o protocolo estendido: o Postgres aceita UMA instrução por vez,
      // então "COMMIT; DROP TABLE x" não consegue escapar da transação somente-leitura.
      r = await client.query({ text: sql, name: `painel_${crypto.randomBytes(6).toString('hex')}`, rowMode: 'array' });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    }
    await client.query(corpo.modo === 'gravar' ? 'COMMIT' : 'ROLLBACK');

    const colunas = (r.fields || []).map(f => f.name);
    const LIMITE = 500;
    const todas = lib.mascararSenha(colunas, r.rows || []);
    responder(res, 200, {
      modo: corpo.modo,
      comando: r.command,
      afetadas: r.rowCount,
      colunas,
      linhas: todas.slice(0, LIMITE),
      truncado: todas.length > LIMITE,
      ms: Date.now() - inicio,
    });
  } catch (e) {
    erroDeBanco(res, e);
  } finally {
    if (client) await client.end().catch(() => {});   // descarta a sessão: nenhum SET vaza para a próxima
  }
}

// ── Arquivos estáticos ──────────────────────────────────────────────────────

function servirArquivo(res, caminho) {
  fs.readFile(caminho, (err, dados) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Não encontrado'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(caminho)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(dados);
  });
}

// ── Servidor ────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const rota = `${req.method} ${url.pathname}`;

  // Trava 1: só aceitamos o computador local (vale para páginas e API).
  if (!lib.hostPermitido(req.headers.host, PORTA)) return responder(res, 403, { erro: 'Host não permitido' });

  if (url.pathname.startsWith('/api/')) {
    // Trava 2: pedidos vindos de outro site ou sem o cabeçalho X-Painel são recusados.
    if (!lib.origemPermitida(req.headers.origin, PORTA) || req.headers['x-painel'] !== '1')
      return responder(res, 403, { erro: 'Pedido recusado: não veio do painel' });

    try {
      switch (rota) {
        case 'GET /api/info':
          return responder(res, 200, {
            banco: `${DB.host}:${DB.port}/${DB.database}`,
            namespaces: lib.NAMESPACES,
            porta: PORTA,
            // O compose usa o nome da pasta do projeto como nome do projeto.
            projetoCompose: path.basename(path.join(__dirname, '..')).toLowerCase(),
          });
        case 'GET /api/containers':      return await containers(res);
        case 'GET /api/containers/logs': return await logsContainer(res, url.searchParams);
        case 'GET /api/k8s':             return await kubernetes(res, url.searchParams);
        case 'GET /api/k8s/logs':        return await logsPod(res, url.searchParams);
        case 'GET /api/k8s/eventos':     return await eventosK8s(res, url.searchParams);
        case 'GET /api/sql/esquema':     return await esquema(res);
        case 'POST /api/sql/executar':   return await executarSql(req, res);
        default: return responder(res, 404, { erro: 'Rota não encontrada' });
      }
    } catch (e) {
      console.error('[painel] erro:', e);
      return responder(res, 500, { erro: 'Erro interno do painel', detalhe: e.message });
    }
  }

  if (req.method !== 'GET') return responder(res, 405, { erro: 'Método não permitido' });

  // O visual é o mesmo do LabSystem: reaproveitamos o CSS do app em vez de copiá-lo.
  if (url.pathname === '/css/styles.css') return servirArquivo(res, CSS_DO_APP);

  const pedido = url.pathname === '/' ? '/index.html' : url.pathname;
  const arquivo = path.resolve(PUBLIC, '.' + pedido);
  if (!arquivo.startsWith(PUBLIC + path.sep)) return responder(res, 403, { erro: 'Acesso negado' });
  servirArquivo(res, arquivo);
});

server.listen(PORTA, '127.0.0.1', () => {
  console.log(`Painel de Aprendizado em http://localhost:${PORTA}  (só acessível deste computador)`);
  console.log(`Console SQL → ${DB.host}:${DB.port}/${DB.database}`);
});
