// Página Containers: lista o que o Docker está rodando e mostra os logs.
const msg = document.getElementById('msg');
const gruposEl = document.getElementById('grupos');
const kpisEl = document.getElementById('kpis');
let projetoAtual = '';
let containerDosLogs = null;

const TEXTO_DO_GRUPO = {
  este: ['LabSystem — Docker Compose', 'A aplicação deste projeto. Cada serviço do docker-compose.yml virou um container.'],
  k3d: ['Cluster Kubernetes (k3d)', 'Cada "computador" (nó) do cluster Kubernetes é, aqui, um container Docker. Os pods que você vê na aba Kubernetes rodam DENTRO destes containers.'],
  compose: ['Outra cópia do Docker Compose', 'Containers de outro projeto Compose (por exemplo as pastas de estudo dev1/dev2 ou projetos de outras pessoas).'],
  outros: ['Outros containers', 'Containers que não foram criados por um docker-compose.yml.'],
};

function classificar(c) {
  if (c.grupo === 'k3d') return 'k3d';
  if (c.grupo === `compose:${projetoAtual}`) return 'este';
  return c.grupo.startsWith('compose:') ? 'compose' : 'outros';
}

// Frase que explica POR QUE um container está em problema, com o próximo passo.
function diagnostico(c) {
  if (c.saude === 'reiniciando') {
    return 'Este container liga e cai em ciclo. Clique em <strong>Logs</strong> para ver o erro. ' +
      'Se for o backend ou a API Python, o motivo mais comum é o <strong>postgres estar parado</strong> (eles precisam do banco para iniciar).';
  }
  if (c.saude === 'doente') return 'O teste de saúde (healthcheck) está falhando. Veja os <strong>Logs</strong>.';
  if (c.saude === 'parado' && c.servico === 'postgres') {
    return 'O banco está parado. Para ligar: <code>docker compose up -d postgres</code> (ele guarda os dados no volume, nada se perde).';
  }
  return null;
}

function linhaDoContainer(c) {
  const aviso = diagnostico(c);
  const ligado = c.estado === 'running';
  return `
    <tr>
      <td><strong>${esc(c.servico || c.nome)}</strong><div class="mono fraco truncar" title="${esc(c.nome)}">${esc(c.nome)}</div></td>
      <td class="mono truncar" title="${esc(c.imagem)}">${esc(c.imagem)}</td>
      <td>${situacaoContainer(c.saude)}<div class="fraco mono">${esc(c.status)}</div></td>
      <td class="mono truncar" title="${esc(c.portas)}">${esc(c.portas) || '<span class="fraco">—</span>'}</td>
      <td>${ligado ? esc(c.cpu) : '<span class="fraco">—</span>'}</td>
      <td>${ligado ? esc(c.memoria) : '<span class="fraco">—</span>'}</td>
      <td><button class="btn btn-secondary btn-sm" type="button" data-logs="${esc(c.nome)}">Logs</button></td>
    </tr>
    ${aviso ? `<tr><td colspan="7"><div class="alerta-linha ${c.saude === 'parado' ? '' : 'erro'}">${aviso}</div></td></tr>` : ''}`;
}

function desenhar(lista) {
  const total = lista.length;
  const rodando = lista.filter(c => c.estado === 'running').length;
  const problemas = lista.filter(c => ['reiniciando', 'doente'].includes(c.saude)).length;
  kpisEl.innerHTML = `
    <div class="kpi"><div class="kpi-valor">${total}</div><div class="kpi-rotulo">Containers no total</div></div>
    <div class="kpi"><div class="kpi-valor bom">${rodando}</div><div class="kpi-rotulo">Rodando agora</div></div>
    <div class="kpi"><div class="kpi-valor ${problemas ? 'ruim' : ''}">${problemas}</div><div class="kpi-rotulo">Com problema</div></div>`;

  const ordem = ['este', 'k3d', 'compose', 'outros'];
  const porTipo = {};
  for (const c of lista) (porTipo[classificar(c)] = porTipo[classificar(c)] || []).push(c);

  gruposEl.innerHTML = ordem.filter(t => porTipo[t]).map(tipo => {
    const [titulo, sub] = TEXTO_DO_GRUPO[tipo];
    return `
      <div class="card">
        <p class="titulo-grupo">${esc(titulo)}</p>
        <p class="sub-grupo">${esc(sub)}</p>
        <div class="table-wrapper">
          <table>
            <thead><tr>
              <th title="Nome do serviço (e, embaixo, o nome do container)">Container</th>
              <th title="A 'receita' usada para criar o container">Imagem</th>
              <th title="Se está ligado, desligado ou em ciclo de reinício">Situação</th>
              <th title="Porta do seu computador → porta dentro do container">Portas</th>
              <th title="Uso do processador agora">CPU</th>
              <th title="Memória RAM usada / limite disponível">Memória</th>
              <th title="Ver o que o programa escreveu">Ações</th>
            </tr></thead>
            <tbody>${porTipo[tipo].map(linhaDoContainer).join('')}</tbody>
          </table>
        </div>
      </div>`;
  }).join('');
}

async function carregar() {
  try {
    const dados = await api('/api/containers');
    limparMensagem(msg);
    desenhar(dados.containers);
    document.getElementById('atualizado').textContent = `Atualizado às ${horaAgora()}`;
  } catch (e) {
    mostrarErro(msg, e);
  }
}

async function carregarLogs() {
  if (!containerDosLogs) return;
  const alvo = document.getElementById('logs-texto');
  try {
    const dados = await api(`/api/containers/logs?nome=${encodeURIComponent(containerDosLogs)}&tail=${document.getElementById('logs-tail').value}`);
    alvo.textContent = dados.logs || '(este container ainda não escreveu nada nos logs)';
    alvo.scrollTop = alvo.scrollHeight;
  } catch (e) {
    alvo.textContent = `Não consegui ler os logs: ${e.message}`;
  }
}

gruposEl.addEventListener('click', ev => {
  const botao = ev.target.closest('[data-logs]');
  if (!botao) return;
  containerDosLogs = botao.dataset.logs;
  document.getElementById('logs-nome').textContent = containerDosLogs;
  document.getElementById('card-logs').hidden = false;
  carregarLogs();
  document.getElementById('card-logs').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});
document.getElementById('logs-recarregar').addEventListener('click', carregarLogs);
document.getElementById('logs-tail').addEventListener('change', carregarLogs);
document.getElementById('logs-fechar').addEventListener('click', () => {
  containerDosLogs = null;
  document.getElementById('card-logs').hidden = true;
});
document.getElementById('btn-atualizar').addEventListener('click', carregar);

api('/api/info').then(i => { projetoAtual = i.projetoCompose; }).catch(() => {}).finally(() => {
  iniciarAtualizacao(carregar, 5, document.getElementById('auto'));
});
