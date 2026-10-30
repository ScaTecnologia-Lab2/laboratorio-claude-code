// Testes das funções puras do painel (sem Docker, sem banco).  node painel/lib.test.js
const assert = require('assert');
const lib = require('./lib');

// ── Nomes: nada que pareça opção de linha de comando ou injeção ────────────
assert.strictEqual(lib.nomeValido('labsystem-backend-1'), true);
assert.strictEqual(lib.nomeValido('backend-7d9f8b6c5-x2x4k'), true);
assert.strictEqual(lib.nomeValido('--all'), false);
assert.strictEqual(lib.nomeValido('-f'), false);
assert.strictEqual(lib.nomeValido('a; rm -rf /'), false);
assert.strictEqual(lib.nomeValido('a b'), false);
assert.strictEqual(lib.nomeValido('$(id)'), false);
assert.strictEqual(lib.nomeValido(''), false);
assert.strictEqual(lib.nomeValido(undefined), false);
assert.strictEqual(lib.nomeValido('x'.repeat(200)), false);

// ── Namespaces e modos permitidos ──────────────────────────────────────────
assert.strictEqual(lib.namespaceValido('labsystem'), true);
assert.strictEqual(lib.namespaceValido('labsystem-dev'), true);
assert.strictEqual(lib.namespaceValido('kube-system'), false);
assert.strictEqual(lib.namespaceValido('argocd'), false);
assert.strictEqual(lib.modoValido('leitura'), true);
assert.strictEqual(lib.modoValido('gravar'), true);
assert.strictEqual(lib.modoValido('admin'), false);

// ── Linhas de log ──────────────────────────────────────────────────────────
assert.strictEqual(lib.limitarTail('50'), 50);
assert.strictEqual(lib.limitarTail('999999'), 1000);
assert.strictEqual(lib.limitarTail('-5'), 1);
assert.strictEqual(lib.limitarTail('abc'), 100);
assert.strictEqual(lib.limitarTail(undefined), 100);

// ── Trava de acesso: só o próprio computador ───────────────────────────────
assert.strictEqual(lib.hostPermitido('localhost:3100', 3100), true);
assert.strictEqual(lib.hostPermitido('127.0.0.1:3100', 3100), true);
assert.strictEqual(lib.hostPermitido('evil.com:3100', 3100), false);
assert.strictEqual(lib.hostPermitido('localhost:9999', 3100), false);
assert.strictEqual(lib.hostPermitido(undefined, 3100), false);
assert.strictEqual(lib.origemPermitida(undefined, 3100), true);
assert.strictEqual(lib.origemPermitida('http://localhost:3100', 3100), true);
assert.strictEqual(lib.origemPermitida('https://evil.com', 3100), false);
assert.strictEqual(lib.origemPermitida('http://localhost:3000', 3100), false);

// ── SQL que toca no disco/programas do servidor do banco ───────────────────
assert.strictEqual(lib.sqlBloqueado('SELECT * FROM clientes'), null);
assert.strictEqual(lib.sqlBloqueado("SELECT 'copyright' AS texto"), null);
assert.notStrictEqual(lib.sqlBloqueado("COPY (SELECT 1) TO PROGRAM 'id'"), null);
assert.notStrictEqual(lib.sqlBloqueado('copy usuarios to stdout'), null);
assert.notStrictEqual(lib.sqlBloqueado("SELECT pg_read_file('/etc/passwd')"), null);
assert.notStrictEqual(lib.sqlBloqueado("SELECT lo_import('/etc/passwd')"), null);
assert.notStrictEqual(lib.sqlBloqueado('/* x */ COPY t FROM stdin'), null);
assert.strictEqual(lib.sqlBloqueado('SELECT 1 -- COPY isso é só comentário'), null);

// ── Senha nunca aparece ────────────────────────────────────────────────────
const colunas = ['id', 'email', 'senha'];
const linhas = [[1, 'a@a.com', 'salt:hash'], [2, 'b@b.com', null]];
const mascaradas = lib.mascararSenha(colunas, linhas);
assert.strictEqual(mascaradas[0][2].includes('salt'), false);
assert.strictEqual(mascaradas[0][1], 'a@a.com');
assert.strictEqual(mascaradas[1][2], null);
assert.deepStrictEqual(lib.mascararSenha(['id'], [[1]]), [[1]]);

// ── Idade e saúde ──────────────────────────────────────────────────────────
const agora = new Date('2026-10-30T12:00:00Z').getTime();
assert.strictEqual(lib.idade('2026-10-30T11:59:15Z', agora), '45s');
assert.strictEqual(lib.idade('2026-10-30T11:48:00Z', agora), '12m');
assert.strictEqual(lib.idade('2026-10-30T09:00:00Z', agora), '3h');
assert.strictEqual(lib.idade('2026-10-28T12:00:00Z', agora), '2d');
assert.strictEqual(lib.idade(undefined, agora), '-');
assert.strictEqual(lib.saudeContainer('running', 'Up 5 minutes (healthy)'), 'saudavel');
assert.strictEqual(lib.saudeContainer('running', 'Up 5 minutes (unhealthy)'), 'doente');
assert.strictEqual(lib.saudeContainer('running', 'Up 5 seconds (health: starting)'), 'iniciando');
assert.strictEqual(lib.saudeContainer('running', 'Up 1 hour'), 'sem-check');
assert.strictEqual(lib.saudeContainer('restarting', 'Restarting (1) 3 seconds ago'), 'reiniciando');
assert.strictEqual(lib.saudeContainer('exited', 'Exited (0) 1 hour ago'), 'parado');

// ── Resumo de pod: o motivo da espera vence a "fase" (CrashLoopBackOff etc.) ─
const podOk = {
  metadata: { name: 'backend-abc', creationTimestamp: '2026-10-30T11:48:00Z', labels: { app: 'backend' } },
  spec: { nodeName: 'agent-0', containers: [{ image: 'x/backend:1' }] },
  status: { phase: 'Running', podIP: '10.42.0.5', containerStatuses: [{ ready: true, restartCount: 0, state: { running: {} } }] },
};
const r1 = lib.resumirPod(podOk, agora);
assert.deepStrictEqual([r1.situacao, r1.prontos, r1.reinicios, r1.app, r1.idade], ['Running', '1/1', 0, 'backend', '12m']);

const podLoop = JSON.parse(JSON.stringify(podOk));
podLoop.status.containerStatuses = [{ ready: false, restartCount: 7, state: { waiting: { reason: 'CrashLoopBackOff' } } }];
const r2 = lib.resumirPod(podLoop, agora);
assert.deepStrictEqual([r2.situacao, r2.prontos, r2.reinicios], ['CrashLoopBackOff', '0/1', 7]);

const podSaindo = JSON.parse(JSON.stringify(podOk));
podSaindo.metadata.deletionTimestamp = '2026-10-30T11:59:00Z';
assert.strictEqual(lib.resumirPod(podSaindo, agora).situacao, 'Terminating');

console.log('painel/lib.test.js: todos os testes passaram');
