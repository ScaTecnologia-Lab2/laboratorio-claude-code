// Página Console SQL: lista as tabelas e executa uma instrução por vez.
const sqlEl = document.getElementById('sql');
const msgGeral = document.getElementById('msg-geral');
const msgSql = document.getElementById('msg-sql');
const botao = document.getElementById('btn-executar');
const confirma = document.getElementById('confirma');

// Exemplos pensados para as tabelas do LabSystem. `modo` é o modo recomendado.
const EXEMPLOS = [
  { titulo: 'Ver os usuários (sem a senha)', modo: 'leitura',
    sql: 'SELECT id, nome, email, role FROM usuarios ORDER BY id;',
    explica: 'SELECT escolhe as colunas, FROM diz a tabela, ORDER BY ordena. A coluna senha nem é pedida: o sistema nunca a mostra.' },
  { titulo: 'Contar clientes por estado', modo: 'leitura',
    sql: 'SELECT estado, count(*) AS total\nFROM clientes\nGROUP BY estado\nORDER BY total DESC;',
    explica: 'GROUP BY junta as linhas iguais e count(*) conta quantas há em cada grupo.' },
  { titulo: 'Produtos com categoria e estoque (JOIN)', modo: 'leitura',
    sql: 'SELECT p.id, p.nome, c.nome AS categoria, p.preco, e.quantidade\nFROM produtos p\nJOIN categorias c ON c.id = p.categoria_id\nLEFT JOIN estoque e ON e.produto_id = p.id\nORDER BY p.nome;',
    explica: 'JOIN liga tabelas pelo que elas têm em comum (aqui, categoria_id). LEFT JOIN mantém o produto mesmo sem linha de estoque.' },
  { titulo: 'Como o banco executa uma consulta (EXPLAIN)', modo: 'leitura',
    sql: 'EXPLAIN SELECT * FROM clientes WHERE nome = \'Ana\';',
    explica: 'EXPLAIN não executa a consulta: mostra o plano que o PostgreSQL escolheria (Seq Scan = lê a tabela inteira; Index Scan = usa um índice).' },
  { titulo: 'Testar um UPDATE sem gravar', modo: 'simular',
    sql: 'UPDATE clientes SET cidade = \'Cidade de Teste\' WHERE id = 1;',
    explica: 'No modo Simular o banco faz a alteração, diz quantas linhas afetou e desfaz tudo (ROLLBACK). Depois confira com um SELECT: nada mudou.' },
  { titulo: 'Testar um DELETE sem gravar', modo: 'simular',
    sql: 'DELETE FROM clientes WHERE id = 1;',
    explica: 'Sempre use WHERE no DELETE! Sem ele, apagaria todas as linhas. Aqui o modo Simular protege você.' },
  { titulo: 'Criar uma tabela de anotações', modo: 'gravar',
    sql: 'CREATE TABLE anotacoes (\n  id SERIAL PRIMARY KEY,\n  texto TEXT NOT NULL,\n  criado_em TIMESTAMP DEFAULT now()\n);',
    explica: 'CREATE TABLE cria uma tabela nova (permanente, modo Gravar). SERIAL gera o id sozinho; PRIMARY KEY o torna único. Depois pratique INSERT e SELECT nela.' },
  { titulo: 'Inserir uma anotação', modo: 'gravar',
    sql: 'INSERT INTO anotacoes (texto) VALUES (\'Aprendi SQL no LabSystem\') RETURNING *;',
    explica: 'INSERT adiciona uma linha; RETURNING * devolve a linha criada (com o id gerado). Exige a tabela anotacoes do exemplo anterior.' },
];

function modoAtual() {
  return document.querySelector('input[name="modo"]:checked').value;
}

function atualizarModo() {
  const gravar = modoAtual() === 'gravar';
  document.getElementById('area-confirma').hidden = !gravar;
  if (!gravar) confirma.checked = false;
  botao.disabled = gravar && !confirma.checked;
  botao.className = `btn ${gravar ? 'btn-danger' : 'btn-primary'}`;
  botao.textContent = { leitura: 'Executar (somente leitura)', simular: 'Simular (não grava)', gravar: 'Gravar de verdade' }[modoAtual()];
}

function valorDaCelula(v) {
  if (v === null || v === undefined) return '<span class="nulo">NULL</span>';
  const texto = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return `<span title="${esc(texto)}">${esc(texto)}</span>`;
}

function mostrarResultado(r) {
  document.getElementById('card-resultado').hidden = false;
  limparMensagem(msgSql);
  const resumo = document.getElementById('resumo');
  const tabela = document.getElementById('tabela');
  const rotulo = { leitura: 'somente leitura', simular: 'simulação (nada foi gravado)', gravar: 'gravado de verdade' }[r.modo];
  let texto = `Comando <strong>${esc(r.comando)}</strong> · ${r.afetadas ?? 0} linha(s) · ${r.ms} ms · modo ${rotulo}.`;
  if (r.truncado) texto += ' Mostrando só as primeiras 500 linhas.';
  if (r.modo === 'simular' && r.comando !== 'SELECT') texto += ' A alteração foi desfeita (ROLLBACK).';
  resumo.innerHTML = texto;

  if (r.colunas.length === 0) {
    tabela.innerHTML = '<p class="vazio">Este comando não devolve linhas (ele só executa uma ação).</p>';
    return;
  }
  tabela.innerHTML = `<table><thead><tr>${r.colunas.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${r.linhas.length
      ? r.linhas.map(l => `<tr>${l.map(v => `<td>${valorDaCelula(v)}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${r.colunas.length}" class="vazio">Nenhuma linha encontrada.</td></tr>`}</tbody></table>`;
}

async function executar() {
  const sql = sqlEl.value.trim();
  if (!sql) { sqlEl.focus(); return; }
  botao.disabled = true;
  try {
    mostrarResultado(await api('/api/sql/executar', { method: 'POST', body: JSON.stringify({ sql, modo: modoAtual() }) }));
    // Quem acabou de gravar (ex.: CREATE TABLE) quer ver a mudança na lista de tabelas.
    if (modoAtual() === 'gravar') carregarEsquema();
  } catch (e) {
    document.getElementById('card-resultado').hidden = false;
    document.getElementById('resumo').textContent = '';
    document.getElementById('tabela').innerHTML = '';
    mostrarErro(msgSql, e);
  } finally {
    atualizarModo();
  }
}

async function carregarEsquema() {
  const alvo = document.getElementById('esquema');
  try {
    const d = await api('/api/sql/esquema');
    limparMensagem(msgGeral);
    document.getElementById('banco-alvo').textContent = d.banco;
    alvo.innerHTML = d.tabelas.length ? d.tabelas.map(t => `
      <details class="esquema-tabela">
        <summary><span>${esc(t.nome)}</span><span class="esquema-linhas">${t.linhas} linha(s)</span></summary>
        <ul class="esquema-colunas">${t.colunas.map(c => `
          <li><span>${c.chavePrimaria ? '<span class="chave" title="Chave primária: identifica cada linha de forma única">chave</span> ' : ''}${esc(c.nome)}</span>
              <span class="esquema-tipo" title="${c.aceitaNulo ? 'Aceita valor vazio (NULL)' : 'Obrigatório (NOT NULL)'}">${esc(c.tipo)}${c.aceitaNulo ? '' : ' *'}</span></li>`).join('')}
        </ul>
        <button type="button" class="btn btn-secondary btn-sm" data-consultar="${esc(t.nome)}">Consultar ${esc(t.nome)}</button>
      </details>`).join('') + '<p class="nota">* = obrigatório (NOT NULL)</p>'
      : '<p class="fraco">O banco ainda não tem tabelas. Inicie o sistema (docker compose up) para criá-las.</p>';
  } catch (e) {
    alvo.innerHTML = '<p class="fraco">Sem conexão com o banco.</p>';
    mostrarErro(msgGeral, e);
    try { document.getElementById('banco-alvo').textContent = (await api('/api/info')).banco; } catch { /* já mostramos o erro */ }
  }
}

// ── Eventos ────────────────────────────────────────────────────────────────
const listaExemplos = document.getElementById('exemplos');
EXEMPLOS.forEach((e, i) => listaExemplos.insertAdjacentHTML('beforeend', `<option value="${i}">${esc(e.titulo)}</option>`));
listaExemplos.addEventListener('change', () => {
  const e = EXEMPLOS[listaExemplos.value];
  document.getElementById('exemplo-explica').textContent = e ? e.explica : '';
  if (!e) return;
  sqlEl.value = e.sql;
  document.querySelector(`input[name="modo"][value="${e.modo}"]`).checked = true;
  atualizarModo();
});

document.getElementById('esquema').addEventListener('click', ev => {
  const b = ev.target.closest('[data-consultar]');
  if (!b) return;
  sqlEl.value = `SELECT * FROM ${b.dataset.consultar} LIMIT 20;`;
  document.querySelector('input[name="modo"][value="leitura"]').checked = true;
  atualizarModo();
  sqlEl.focus();
});

document.querySelectorAll('input[name="modo"]').forEach(r => r.addEventListener('change', atualizarModo));
confirma.addEventListener('change', atualizarModo);
botao.addEventListener('click', executar);
document.getElementById('btn-limpar').addEventListener('click', () => { sqlEl.value = ''; sqlEl.focus(); });
document.getElementById('btn-esquema').addEventListener('click', carregarEsquema);
sqlEl.addEventListener('keydown', ev => {
  if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter' && !botao.disabled) { ev.preventDefault(); executar(); }
});

atualizarModo();
carregarEsquema();
