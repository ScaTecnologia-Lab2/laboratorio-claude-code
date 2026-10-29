// ============================================================================
// carga.js — roteiro do k6: simula muitos usuários usando o LabSystem
// ----------------------------------------------------------------------------
// Rodado por scripts/k8s/teste-carga.sh (k6 em container, nada a instalar).
//
// Cada "usuário virtual" (VU) repete: lista clientes → lista fornecedores →
// consulta a sessão (/me). O número de VUs sobe em degraus (stages) para você
// ver o HPA reagir, depois desce para ver o cluster "encolher".
//
// Variáveis (passadas pelo script): ALVO (URL), PICO (VUs no pico), MINUTOS.
// ============================================================================
import http from 'k6/http';
import { check } from 'k6';

const ALVO = __ENV.ALVO || 'http://localhost:8081';
const PICO = Number(__ENV.PICO || 60);
const MIN = Number(__ENV.MINUTOS || 4);

export const options = {
  stages: [
    { duration: `${MIN * 0.25}m`, target: Math.round(PICO / 3) }, // aquecimento
    { duration: `${MIN * 0.25}m`, target: PICO },                 // subida
    { duration: `${MIN * 0.35}m`, target: PICO },                 // pico sustentado
    { duration: `${MIN * 0.15}m`, target: 0 },                    // fim da demanda
  ],
  // Critérios de "passou": menos de 2% de erros e 95% das respostas < 2s.
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<2000'],
  },
};

// setup() roda 1 vez: faz login e repassa o cookie a todos os VUs.
export function setup() {
  const res = http.post(`${ALVO}/login`,
    JSON.stringify({ email: __ENV.EMAIL || 'admin@labsystem.com', senha: __ENV.SENHA || 'admin123' }),
    { headers: { 'Content-Type': 'application/json' } });
  if (res.status !== 200) throw new Error(`Login falhou (${res.status}): ${res.body}`);
  return { cookie: `sessao_id=${res.cookies.sessao_id[0].value}` };
}

export default function (dados) {
  const params = { headers: { Cookie: dados.cookie } };
  for (const rota of ['/clientes', '/fornecedores', '/me']) {
    const r = http.get(`${ALVO}${rota}`, params);
    check(r, { [`${rota} 200`]: x => x.status === 200 });
  }
}
