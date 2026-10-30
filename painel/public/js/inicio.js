// Página inicial: mapa da aplicação com o estado de cada peça no Compose e no Kubernetes.
const PECAS = [
  { servico: 'frontend', titulo: 'frontend', papel: 'nginx — entrega as páginas e repassa a API', k8s: 'frontend' },
  { servico: 'backend', titulo: 'backend', papel: 'Node.js — login, clientes, produtos…', k8s: 'backend' },
  { servico: 'fornecedores', titulo: 'fornecedores', papel: 'Python/Flask — CRUD de fornecedores', k8s: 'fornecedores' },
  { servico: 'postgres', titulo: 'postgres', papel: 'PostgreSQL — guarda todos os dados', k8s: 'postgres' },
];

const sem = '<span class="situacao neutro">indisponível</span>';

function estadoCompose(containers, projeto, servico) {
  if (!containers) return sem;
  const c = containers.find(x => x.grupo === `compose:${projeto}` && x.servico === servico);
  if (!c) return '<span class="situacao neutro">não criado</span>';
  return situacaoContainer(c.saude);
}

function estadoK8s(dados, nome) {
  if (!dados) return sem;
  const x = [...dados.deployments, ...dados.statefulsets].find(i => i.nome === nome);
  if (!x) return '<span class="situacao neutro">não existe</span>';
  const cor = x.prontas === x.desejadas ? 'ok' : (x.prontas === 0 ? 'erro' : 'alerta');
  return `<span class="situacao ${cor}">${x.prontas}/${x.desejadas}</span>`;
}

async function tentar(caminho) {
  try { return await api(caminho); } catch { return null; }
}

(async () => {
  const info = await tentar('/api/info');
  const [docker, dev, prod] = await Promise.all([
    tentar('/api/containers'),
    tentar('/api/k8s?ns=labsystem-dev'),
    tentar('/api/k8s?ns=labsystem'),
  ]);
  const projeto = info ? info.projetoCompose : '';
  const containers = docker ? docker.containers : null;

  document.getElementById('fluxo').innerHTML = PECAS.map(p => `
    <div class="fluxo-caixa">
      <h3>${esc(p.titulo)}</h3>
      <p class="fluxo-papel">${esc(p.papel)}</p>
      <div class="fluxo-linha"><span>Docker Compose</span>${estadoCompose(containers, projeto, p.servico)}</div>
      <div class="fluxo-linha"><span>K8s desenvolvimento</span>${estadoK8s(dev, p.k8s)}</div>
      <div class="fluxo-linha"><span>K8s produção</span>${estadoK8s(prod, p.k8s)}</div>
    </div>`).join('');

  const falhas = [];
  if (!docker) falhas.push('Docker');
  if (!dev && !prod) falhas.push('Kubernetes (kubectl)');
  if (falhas.length) {
    const msg = document.getElementById('msg');
    msg.className = 'mensagem err';
    msg.textContent = `Não consegui consultar: ${falhas.join(' e ')}. As outras partes do painel continuam funcionando; abra a tela correspondente para ver a dica de como resolver.`;
  }
})();
