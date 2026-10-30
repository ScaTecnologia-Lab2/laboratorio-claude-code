// Página Kubernetes: nós, pods, deployments, services, HPA e eventos de um namespace.
const msg = document.getElementById('msg');
const nsEl = document.getElementById('ns');
let podDosLogs = null;

const semDados = (cols, texto) => `<tr><td colspan="${cols}" class="vazio">${texto}</td></tr>`;

function situacaoPod(p) {
  return `<span class="situacao ${corDoPod(p)}">${esc(p.situacao)}</span>`;
}

function barra(valor, maximo) {
  return `<meter min="0" max="${maximo}" value="${valor}"></meter>`;
}

function desenharKpis(d) {
  const prontos = d.pods.filter(p => corDoPod(p) === 'ok').length;
  const ruins = d.pods.filter(p => corDoPod(p) === 'erro').length;
  const nosOk = d.nos.filter(n => n.pronto).length;
  document.getElementById('kpis').innerHTML = `
    <div class="kpi"><div class="kpi-valor ${nosOk === d.nos.length ? 'bom' : 'ruim'}">${nosOk}/${d.nos.length}</div><div class="kpi-rotulo">Nós prontos</div></div>
    <div class="kpi"><div class="kpi-valor ${prontos === d.pods.length ? 'bom' : ''}">${prontos}/${d.pods.length}</div><div class="kpi-rotulo">Pods prontos</div></div>
    <div class="kpi"><div class="kpi-valor ${ruins ? 'ruim' : ''}">${ruins}</div><div class="kpi-rotulo">Pods com falha</div></div>
    <div class="kpi"><div class="kpi-valor">${d.pods.reduce((s, p) => s + p.reinicios, 0)}</div><div class="kpi-rotulo">Reinícios somados</div></div>`;
}

function desenharMapa(d) {
  document.getElementById('mapa').innerHTML = d.nos.map(n => {
    const meus = d.pods.filter(p => p.no === n.nome);
    const chips = meus.map(p =>
      `<button type="button" class="pod-chip ${corDoPod(p)}" data-pod="${esc(p.nome)}" title="${esc(p.nome)} — ${esc(p.situacao)}">${esc(p.app)}</button>`).join('');
    const cpu = parseFloat(n.cpuPct);
    const mem = parseFloat(n.memoriaPct);
    const uso = n.cpuUso
      ? `<div>CPU ${esc(n.cpuUso)} (${esc(n.cpuPct)}) <meter min="0" max="100" value="${cpu || 0}" high="80"></meter></div>
         <div>Memória ${esc(n.memoriaUso)} de ${esc(n.memoriaTotal)} (${esc(n.memoriaPct)}) <meter min="0" max="100" value="${mem || 0}" high="80"></meter></div>`
      : `<div class="fraco">Memória total: ${esc(n.memoriaTotal)} · CPUs: ${esc(n.cpuTotal)}</div>`;
    return `
      <div class="mapa-no ${n.pronto ? '' : 'fora'}">
        <div class="mapa-no-nome">${esc(n.nome)}</div>
        <div class="mapa-no-papel">${esc(n.papel)} · ${esc(n.ip)} · ${esc(n.versao)} · ${n.pronto ? 'pronto' : '<strong>NÃO PRONTO</strong>'}</div>
        <div class="mapa-no-uso">${uso}</div>
        <div class="mapa-pods">${chips || '<span class="mapa-vazio">nenhum pod deste ambiente aqui</span>'}</div>
      </div>`;
  }).join('');
}

function desenharPods(d) {
  document.getElementById('tb-pods').innerHTML = d.pods.length ? d.pods.map(p => `
    <tr>
      <td class="mono">${esc(p.nome)}</td>
      <td>${situacaoPod(p)}</td>
      <td>${esc(p.prontos)}</td>
      <td>${p.reinicios}</td>
      <td class="mono truncar" title="${esc(p.no)}">${esc(p.no)}</td>
      <td class="mono">${esc(p.ip)}</td>
      <td>${esc(p.cpu) || '<span class="fraco">—</span>'}</td>
      <td>${esc(p.memoria) || '<span class="fraco">—</span>'}</td>
      <td>${esc(p.idade)}</td>
      <td><button type="button" class="btn btn-secondary btn-sm" data-pod="${esc(p.nome)}">Logs</button></td>
    </tr>`).join('') : semDados(10, 'Nenhum pod neste ambiente. Ele foi criado? (sh scripts/k8s/dev-deploy.sh)');
}

function desenharDeploys(d) {
  const linhas = [
    ...d.deployments.map(x => ({ ...x, tipo: 'Deployment' })),
    ...d.statefulsets.map(x => ({ ...x, tipo: 'StatefulSet', estrategia: '—', atualizadas: '—' })),
  ];
  document.getElementById('tb-deploys').innerHTML = linhas.length ? linhas.map(x => `
    <tr>
      <td><strong>${esc(x.nome)}</strong><div class="fraco">${x.tipo}</div></td>
      <td><span class="situacao ${x.prontas === x.desejadas ? 'ok' : 'alerta'}">${x.prontas} / ${x.desejadas}</span></td>
      <td>${esc(x.atualizadas)}</td>
      <td class="mono truncar" title="${esc(x.imagem)}">${esc(x.imagem)}</td>
      <td>${esc(x.estrategia)}</td>
      <td>${esc(x.idade)}</td>
    </tr>`).join('') : semDados(6, 'Nada aqui ainda.');
}

function desenharServicos(d) {
  document.getElementById('tb-servicos').innerHTML = d.servicos.length ? d.servicos.map(s => `
    <tr>
      <td><strong>${esc(s.nome)}</strong></td>
      <td>${esc(s.tipo)}</td>
      <td class="mono">${esc(s.ipInterno)}</td>
      <td class="mono">${esc(s.portas)}</td>
      <td class="mono">${esc(s.externo)}</td>
    </tr>`).join('') : semDados(5, 'Nenhum Service.');
}

function desenharHpa(d) {
  document.getElementById('tb-hpa').innerHTML = d.hpas.length ? d.hpas.map(h => `
    <tr>
      <td><strong>${esc(h.alvo)}</strong></td>
      <td>${h.min} – ${h.max}</td>
      <td>${h.atuais} → ${h.desejadas} ${barra(h.atuais, h.max)}</td>
      <td>${h.cpuAtual === null ? '<span class="fraco">sem métrica</span>' : `${h.cpuAtual}% / ${h.cpuAlvo}%`}</td>
    </tr>`).join('') : semDados(4, 'Nenhum HPA.');
}

async function carregarEventos() {
  try {
    const d = await api(`/api/k8s/eventos?ns=${nsEl.value}`);
    document.getElementById('tb-eventos').innerHTML = d.eventos.length ? d.eventos.map(e => `
      <tr>
        <td><span class="situacao ${e.tipo === 'Warning' ? 'alerta' : 'ok'}">${esc(e.tipo)}</span></td>
        <td>${esc(e.motivo)}</td>
        <td class="mono">${esc(e.objeto)}</td>
        <td>${esc(e.mensagem)}</td>
        <td>${e.vezes}</td>
        <td>${esc(e.idade)}</td>
      </tr>`).join('') : semDados(6, 'Sem eventos recentes (o Kubernetes só guarda cerca de 1 hora).');
  } catch {
    document.getElementById('tb-eventos').innerHTML = semDados(6, 'Não foi possível carregar os eventos.');
  }
}

async function carregar() {
  try {
    const d = await api(`/api/k8s?ns=${nsEl.value}`);
    limparMensagem(msg);
    desenharKpis(d);
    desenharMapa(d);
    desenharPods(d);
    desenharDeploys(d);
    desenharServicos(d);
    desenharHpa(d);
    document.getElementById('atualizado').textContent =
      `Atualizado às ${horaAgora()}${d.metricas ? '' : ' — sem métricas de CPU/memória (metrics-server indisponível)'}`;
    carregarEventos();
  } catch (e) {
    mostrarErro(msg, e);
  }
}

async function carregarLogs() {
  if (!podDosLogs) return;
  const alvo = document.getElementById('logs-texto');
  try {
    const d = await api(`/api/k8s/logs?ns=${nsEl.value}&pod=${encodeURIComponent(podDosLogs)}&tail=100`);
    alvo.textContent = d.logs || '(este pod ainda não escreveu nada nos logs)';
    alvo.scrollTop = alvo.scrollHeight;
  } catch (e) {
    alvo.textContent = `Não consegui ler os logs: ${e.message}`;
  }
}

document.addEventListener('click', ev => {
  const alvo = ev.target.closest('[data-pod]');
  if (!alvo) return;
  podDosLogs = alvo.dataset.pod;
  document.getElementById('logs-nome').textContent = podDosLogs;
  document.getElementById('card-logs').hidden = false;
  carregarLogs();
  document.getElementById('card-logs').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});
document.getElementById('logs-recarregar').addEventListener('click', carregarLogs);
document.getElementById('logs-fechar').addEventListener('click', () => {
  podDosLogs = null;
  document.getElementById('card-logs').hidden = true;
});
document.getElementById('btn-atualizar').addEventListener('click', carregar);
nsEl.addEventListener('change', () => {
  podDosLogs = null;
  document.getElementById('card-logs').hidden = true;
  carregar();
});

iniciarAtualizacao(carregar, 5, document.getElementById('auto'));
