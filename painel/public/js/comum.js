// Funções compartilhadas pelas páginas do Painel de Aprendizado.

// Todo pedido à API leva X-Painel: o servidor recusa pedidos sem esse cabeçalho
// (assim um site qualquer aberto no navegador não consegue usar o painel).
async function api(caminho, opcoes = {}) {
  const resposta = await fetch(caminho, {
    ...opcoes,
    headers: { 'X-Painel': '1', 'Content-Type': 'application/json', ...(opcoes.headers || {}) },
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const erro = new Error(dados.erro || `Erro ${resposta.status}`);
    erro.dados = dados;
    throw erro;
  }
  return dados;
}

// Escapa texto antes de entrar em innerHTML (nomes e logs vêm de fora do painel).
function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Mostra o erro numa caixa .mensagem, com a "dica" de como resolver quando houver.
function mostrarErro(elemento, erro) {
  const d = erro.dados || {};
  elemento.className = 'mensagem err';
  elemento.innerHTML = `<strong>${esc(erro.message)}</strong>` +
    (d.detalhe ? `<div class="mono fraco">${esc(d.detalhe)}</div>` : '') +
    (d.dica ? `<div class="dica">${esc(d.dica)}</div>` : '');
}

function limparMensagem(elemento) {
  elemento.className = 'mensagem';
  elemento.textContent = '';
}

// Chama `funcao` agora e a cada `segundos` enquanto a caixa estiver marcada.
function iniciarAtualizacao(funcao, segundos, caixa) {
  let relogio = null;
  const aplicar = () => {
    clearInterval(relogio);
    relogio = caixa.checked ? setInterval(funcao, segundos * 1000) : null;
  };
  caixa.addEventListener('change', aplicar);
  aplicar();
  funcao();
}

function horaAgora() {
  return new Date().toLocaleTimeString('pt-BR');
}

// Estado de um container Docker → texto e cor.
const SAUDE_CONTAINER = {
  saudavel:    { texto: 'Saudável',      cor: 'ok' },
  'sem-check': { texto: 'Rodando',       cor: 'ok' },
  iniciando:   { texto: 'Iniciando',     cor: 'alerta' },
  doente:      { texto: 'Com problema',  cor: 'erro' },
  reiniciando: { texto: 'Reiniciando',   cor: 'erro' },
  parado:      { texto: 'Parado',        cor: 'neutro' },
};

function situacaoContainer(saude) {
  const s = SAUDE_CONTAINER[saude] || { texto: saude, cor: 'neutro' };
  return `<span class="situacao ${s.cor}">${esc(s.texto)}</span>`;
}

// Situação de um pod do Kubernetes → cor.
function corDoPod(pod) {
  if (pod.situacao === 'Running' && pod.prontos.split('/')[0] === pod.prontos.split('/')[1]) return 'ok';
  if (['Pending', 'ContainerCreating', 'PodInitializing', 'Terminating', 'Running'].includes(pod.situacao)) return 'alerta';
  return 'erro';
}
