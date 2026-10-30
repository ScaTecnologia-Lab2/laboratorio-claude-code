// ============================================================================
// painel/lib.js — funções puras do Painel de Aprendizado (sem rede, sem Docker)
// ----------------------------------------------------------------------------
// Ficam separadas do servidor para serem testadas (painel/lib.test.js) e
// porque várias são TRAVAS DE SEGURANÇA: o painel executa comandos no seu
// computador, então tudo que vem do navegador é validado aqui antes.
// ============================================================================

// Só estes namespaces do Kubernetes podem ser consultados.
const NAMESPACES = ['labsystem-dev', 'labsystem'];

// Nome de container/pod: começa com letra ou número (nunca com "-", para não
// ser confundido com uma opção de linha de comando) e usa só estes símbolos.
const NOME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

const MODOS_SQL = ['leitura', 'simular', 'gravar'];

function nomeValido(nome) {
  return typeof nome === 'string' && NOME_RE.test(nome);
}

function namespaceValido(ns) {
  return NAMESPACES.includes(ns);
}

function modoValido(modo) {
  return MODOS_SQL.includes(modo);
}

// Quantidade de linhas de log: número inteiro entre 1 e 1000 (padrão 100).
function limitarTail(valor) {
  const n = parseInt(valor, 10);
  if (Number.isNaN(n)) return 100;
  return Math.min(Math.max(n, 1), 1000);
}

// O painel só atende quem acessa pelo próprio computador. Conferir o cabeçalho
// Host impede o ataque de "DNS rebinding" (um site qualquer apontando um nome
// dele para 127.0.0.1 para conversar com o painel).
function hostPermitido(host, porta) {
  return ['localhost', '127.0.0.1', '[::1]'].some(h => host === `${h}:${porta}`);
}

// Pedidos feitos por outro site trazem um Origin diferente — são recusados.
// Sem Origin (acesso direto pela barra de endereço) é permitido.
function origemPermitida(origin, porta) {
  if (!origin) return true;
  return ['localhost', '127.0.0.1', '[::1]'].some(h => origin === `http://${h}:${porta}`);
}

// O console SQL conecta como "postgres" (superusuário). Comandos que tocam no
// sistema de arquivos ou rodam programas DENTRO do container do banco não
// ajudam a aprender SQL e são bloqueados em todos os modos. Não é uma barreira
// contra quem já é dono do banco — é uma proteção contra acidente.
const SQL_BLOQUEADO = [
  [/\bcopy\b/i, 'COPY lê/escreve arquivos (ou roda programas) no servidor do banco'],
  [/\bpg_(read_file|read_binary_file|ls_dir|stat_file|file_write)\b/i, 'funções pg_* de arquivo acessam o disco do servidor'],
  [/\blo_(import|export)\b/i, 'lo_import/lo_export acessam arquivos do servidor'],
  [/\b(dblink|postgres_fdw)\b/i, 'conexões externas a outros bancos não são permitidas aqui'],
];

// Retorna o motivo do bloqueio (texto) ou null se o SQL pode seguir.
function sqlBloqueado(sql) {
  // Remove comentários antes de procurar, para "CO/**/PY" ou "-- COPY" não enganarem.
  const limpo = String(sql).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
  const achou = SQL_BLOQUEADO.find(([re]) => re.test(limpo));
  return achou ? achou[1] : null;
}

// Nunca mostrar hash de senha, mesmo que o SQL digitado peça (regra do projeto).
function mascararSenha(colunas, linhas) {
  const idx = colunas.map((c, i) => (/^senha$/i.test(c) ? i : -1)).filter(i => i >= 0);
  if (idx.length === 0) return linhas;
  return linhas.map(l => l.map((v, i) => (idx.includes(i) && v !== null ? '•••••••• (oculto pelo painel)' : v)));
}

// Idade legível, como o kubectl mostra: 45s, 12m, 3h, 2d.
function idade(iso, agora = Date.now()) {
  if (!iso) return '-';
  const s = Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 1000));
  if (s < 120) return `${s}s`;
  if (s < 7200) return `${Math.floor(s / 60)}m`;
  if (s < 172800) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// Estado de saúde de um container a partir do texto do "docker ps".
function saudeContainer(estado, status) {
  if (estado === 'restarting') return 'reiniciando';
  if (estado !== 'running') return 'parado';
  if (/\(unhealthy\)/.test(status)) return 'doente';
  if (/\(health: starting\)/.test(status)) return 'iniciando';
  if (/\(healthy\)/.test(status)) return 'saudavel';
  return 'sem-check';
}

// Transforma o JSON de um Pod do Kubernetes em uma linha simples.
function resumirPod(pod, agora = Date.now()) {
  const status = pod.status || {};
  const cs = status.containerStatuses || [];
  const prontos = cs.filter(c => c.ready).length;
  const reinicios = cs.reduce((soma, c) => soma + (c.restartCount || 0), 0);

  // Mesmo critério do kubectl: motivo de espera/término tem prioridade sobre a "fase".
  let situacao = status.phase || 'Unknown';
  for (const c of cs) {
    if (c.state && c.state.waiting && c.state.waiting.reason) situacao = c.state.waiting.reason;
    else if (c.state && c.state.terminated && c.state.terminated.reason) situacao = c.state.terminated.reason;
  }
  if (pod.metadata.deletionTimestamp) situacao = 'Terminating';

  const labels = pod.metadata.labels || {};
  const containers = (pod.spec && pod.spec.containers) || [];
  return {
    nome: pod.metadata.name,
    app: labels.app || labels['app.kubernetes.io/name'] || '-',
    situacao,
    prontos: `${prontos}/${containers.length}`,
    reinicios,
    no: (pod.spec && pod.spec.nodeName) || '-',
    ip: status.podIP || '-',
    idade: idade(pod.metadata.creationTimestamp, agora),
    imagem: containers[0] ? containers[0].image : '-',
  };
}

module.exports = {
  NAMESPACES, MODOS_SQL,
  nomeValido, namespaceValido, modoValido, limitarTail,
  hostPermitido, origemPermitida, sqlBloqueado, mascararSenha, idade, saudeContainer, resumirPod,
};
