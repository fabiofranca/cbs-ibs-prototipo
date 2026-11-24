// Protótipo navegável (JavaScript puro, sem dependências, sem rede). Tudo é simulado em memória.
import { criar, CATEGORIAS_CFOP, AGORA, CERT, XMOTIVO, EV_DESC, fmtChave, fmtNum } from './dados.js'
import { instalar } from './modulos.js'

let D = criar()
const SIM = { cenario: 'normal', vincOk: false, procOk: false, cert: 'normal', rej593: false }
const SERV = ['NF-e', 'NFC-e', 'CT-e', 'NFS-e']
const sefsc = (p) => p.cursores.filter((c) => c.servico !== 'NFS-e') // o vínculo do SAT (8002) vale só para os serviços da SEF-SC
const TEMAS = ['sistema', 'claro', 'escuro']
const S = {
  tema: lerTema(),
  carregando: false,
  painel: { filtro: 'todos', busca: '', pag: 1, ordem: 'estado' },
  prods: { filtro: 'todos', busca: '', pag: 1 },
  notas: { prod: '', tipo: '', cfop: '', comp: '', sit: '', chave: '', lig: false, mostrar: 12, sel: [] },
  falhas: { aba: 'agir', sel: new Set() },
  imp: { aba: 'consultas', prod: '', soProblema: false },
  cmd: null, // { srv, tipo } formulário de comando aberto na gaveta
  redef: false,
  form: null, // valores e erro de formulários após falha
  dlg: null, // 'novo' | 'cert' | 'ligar' | 'manif'
  foco: null,
}
const POR_PAG = 8

// ---------- utilitários de HTML (escapa tudo, exceto o que vem de html``) ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
class Raw { constructor(s) { this.s = s } }
const raw = (s) => new Raw(s)
const val = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(val).join('') : v == null || v === false ? '' : esc(v))
const html = (strs, ...vals) => raw(strs.reduce((a, s, i) => a + s + (i < vals.length ? val(vals[i]) : ''), ''))

function lerTema() { try { return localStorage.getItem('tema') || 'sistema' } catch { return 'sistema' } }
function aplicarTema() {
  const el = document.documentElement
  if (S.tema === 'sistema') el.removeAttribute('data-theme')
  else el.dataset.theme = S.tema === 'claro' ? 'light' : 'dark'
  try { localStorage.setItem('tema', S.tema) } catch { /* sem armazenamento: o tema só não é lembrado */ }
}

// ---------- regras de estado ----------
const SEV = { erro: 0, vinc: 1, bloq: 2, pausa: 3, exec: 4, ok: 5 }
const prods = () => (SIM.cenario === 'vazio' ? [] : D.produtores)
const notasTodas = () => (SIM.cenario === 'vazio' ? [] : D.notas)
const parado = (srv) => SIM.cenario === 'agente_parado' && srv === 'CT-e'

function est(p, c) {
  if (c.exec) return { k: 'exec', sim: '◐', cls: 'info', txt: 'Executando' }
  if (c.servico === 'NFS-e' && p.semProcuracao) return { k: 'vinc', sim: '▲', cls: 'aviso', txt: 'Sem procuração (E2245)', det: 'cadastrar no ADN' }
  if (p.semVinculo && c.servico !== 'NFS-e') return { k: 'vinc', sim: '▲', cls: 'aviso', txt: 'Sem vínculo (8002)', det: 'cadastrar no SAT' }
  if (c.pausado) return { k: 'pausa', sim: '‖', cls: 'neutro', txt: 'Pausado', det: c.pausado.motivo }
  if (SIM.cenario === 'bloqueio' && c.servico === 'NFC-e') return { k: 'bloq', sim: '■', cls: 'erro', txt: 'Bloqueado até 15:40', det: 'excesso de consultas' }
  return { k: 'ok', sim: '○', cls: 'ok', txt: 'Aguardando' }
}
const pior = (p) => Math.min(...p.cursores.map((c) => SEV[est(p, c).k]))
const comProblema = (p) => p.cursores.some((c) => ['vinc', 'bloq', 'erro'].includes(est(p, c).k))
const proxima = (c) => (parado(c.servico) ? 'vencida há 6 min' : SIM.cenario === 'bloqueio' && c.servico === 'NFC-e' ? '15:40' : c.proxima)
const total = (p) => p.cont.nfe + p.cont.nfce + p.cont.cte + p.cont.ev + p.cont.nfse
const nAgir = () => prods().filter((p) => p.semVinculo || p.semProcuracao).length
const vinculo = (p) => (p.semVinculo ? 'Sem vínculo (8002)' : p.cursores[0].cstat == null ? 'Não verificado' : `Ok (${p.cursores[0].cstat})`)
const procuracao = (p) => (p.semProcuracao ? 'Sem procuração (E2245)' : p.cursores[3].cstat == null ? 'Não verificada' : `Ok (${p.cursores[3].cstat})`)

function alertas() {
  const a = []
  if (SIM.cenario === 'bloqueio') a.push({ k: 'crit', sim: '■', selo: 'Problema: bloqueio da SEF-SC (NFC-e)', txt: 'Bloqueio da SEF-SC no serviço NFC-e até 15:40. O sistema espera sozinho; nada a fazer.' })
  if (SIM.cenario === 'agente_parado') a.push({ k: 'crit', sim: '✕', selo: 'Problema: agente CT-e parado', txt: 'Agente CT-e parado (sem sinal há 4 min). Nada é capturado de CT-e até ele voltar, mesmo que os produtores apareçam "Aguardando".' })
  a.push(...X.certAlertas())
  const sv = prods().filter((p) => p.semVinculo).length
  if (sv) a.push({ k: 'aviso', sim: '▲', txt: `${sv} produtor${sv > 1 ? 'es' : ''} sem vínculo na SEF-SC (8002). Ação: cadastrar o vínculo no SAT.`, link: ['#/falhas', 'Ver Falhas'] })
  const sp = prods().filter((p) => p.semProcuracao).length
  if (sp) a.push({ k: 'aviso', sim: '▲', txt: `${sp} produtor${sp > 1 ? 'es' : ''} sem procuração no ADN (E2245): a NFS-e dele não é capturada. Ação: cadastrar a procuração.`, link: ['#/falhas', 'Ver Falhas'] })
  const sa = prods().filter((p) => p.syncAntigo).length
  if (sa) a.push({ k: 'aviso', sim: '▲', txt: `${sa} produtor sem sincronismo completo há mais de 36 h.`, link: ['#/produtores', 'Ver produtores'] })
  return a
}
function selo() {
  const a = alertas()
  const crit = a.find((x) => x.k === 'crit')
  if (crit) return { cls: 'erro', sim: crit.sim, txt: crit.selo }
  if (a.length) return { cls: 'aviso', sim: '▲', txt: `Atenção: ${a.length} alerta${a.length > 1 ? 's' : ''}` }
  return { cls: 'ok', sim: '○', txt: 'Tudo em ordem' }
}

// ---------- roteamento ----------
function rota() {
  const [path, q = ''] = location.hash.replace(/^#\/?/, '').split('?')
  const [r = 'painel', sub] = path.split('/')
  return { r, sub: sub ? decodeURIComponent(sub) : null, q: new URLSearchParams(q) }
}
function irPara(R, mudar) {
  const q = new URLSearchParams(R.q)
  mudar(q)
  const qs = q.toString()
  location.hash = `#/${R.r}${R.sub ? '/' + encodeURIComponent(R.sub) : ''}${qs ? '?' + qs : ''}`
}

// ---------- componentes ----------
function tabela(cols, linhas, legenda, vazio) {
  if (!linhas.length) return html`<div class="vazio">${vazio}</div>`
  return html`<div class="rolagem" tabindex="0" role="region" aria-label="${legenda}"><table><caption class="sr">${legenda}</caption><thead><tr>${cols}</tr></thead><tbody>${linhas}</tbody></table></div>`
}
const chip = (txt, ativo, a, extra = '') => html`<button type="button" class="chip" aria-pressed="${String(ativo)}" data-a="${a}" ${raw(extra)}>${txt}</button>`
function pagina(n, pag, porPag, a) {
  const pags = Math.max(1, Math.ceil(n / porPag))
  const ini = n ? (pag - 1) * porPag + 1 : 0
  return html`<div class="pag"><span>Mostrando ${ini}–${Math.min(n, pag * porPag)} de ${n}</span>
    <button type="button" data-a="${a}" data-d="-1" ${raw(pag <= 1 ? 'disabled' : '')} aria-label="Página anterior">◀</button>
    <span>Página ${pag} de ${pags}</span>
    <button type="button" data-a="${a}" data-d="1" ${raw(pag >= pags ? 'disabled' : '')} aria-label="Próxima página">▶</button></div>`
}
const esqueleto = () => html`<div role="status" aria-label="Carregando"><span class="sr">Carregando…</span><div class="ags"><div class="cartao"><span class="esq"></span><span class="esq"></span></div><div class="cartao"><span class="esq"></span><span class="esq"></span></div><div class="cartao"><span class="esq"></span><span class="esq"></span></div></div>${[1, 2, 3, 4, 5].map(() => html`<span class="esq"></span>`)}</div>`
const caixaErro = () => html`<div class="caixa-erro" role="alert">✕ Não foi possível carregar os dados. <button type="button" data-a="retentar">Tentar novamente</button><small>Simulação: no sistema real, 401 vira "token da API ausente ou inválido" e falha de rede vira "sem conexão com o servidor".</small></div>`
const guarda = (fn) => (R) => (S.carregando ? esqueleto() : SIM.cenario === 'erro' ? caixaErro() : fn(R))

// ---------- topo ----------
function vTopo(R) {
  const s = selo()
  const ABAS = ['painel', 'produtores', 'notas', 'falhas', 'importacoes', 'certificados', 'vinculos', 'manifestacao']
  const aba = (r, nome, extra = '') => html`<a href="#/${r}" ${raw(R.r === r || (r === 'importacoes' && R.r === 'importar') || (r === 'painel' && !ABAS.includes(R.r) && R.r !== 'importar') ? 'aria-current="page"' : '')}>${nome}${extra}</a>`
  return html`<div class="faixa">PROTÓTIPO · dados fictícios · nada aqui consulta a SEF-SC nem o banco</div>
  <header class="topo"><h1>Captura de notas</h1>
    <span class="selo ${s.cls}" role="status">${s.sim} ${s.txt}</span>
    <span class="suave">${X.certTopo()}</span>
    <span class="suave ml">Ao vivo ●</span>
    <button type="button" data-a="tema" aria-label="Trocar o tema. Atual: ${S.tema}">Tema: ${S.tema}</button>
  </header>
  <nav class="abas" aria-label="Seções">${aba('painel', 'Painel')}${aba('produtores', 'Produtores')}${aba('notas', 'Notas')}${aba('falhas', 'Falhas', nAgir() ? html`<span class="contagem">${nAgir()}<span class="sr"> precisam de ação</span></span>` : '')}${aba('importacoes', 'Importações')}${aba('certificados', 'Certificados')}${aba('vinculos', 'Transição CPF→CNPJ', html`<span class="hipt">hipótese</span>`)}${aba('manifestacao', 'Manifestação', html`<span class="hipt">hipótese</span>`)}</nav>`
}

// ---------- T1 Painel ----------
function agentes() {
  return SERV.map((srv, i) => {
    const cs = prods().flatMap((p) => p.cursores.filter((c) => c.servico === srv).map((c) => ({ p, c })))
    const n = {}
    cs.forEach(({ p, c }) => { const k = est(p, c).k; n[k] = (n[k] || 0) + 1 })
    const docs = prods().reduce((a, p) => a + (srv === 'NF-e' ? p.cont.nfe : srv === 'NFC-e' ? p.cont.nfce : srv === 'CT-e' ? p.cont.cte : p.cont.nfse), 0)
    const horas = cs.filter(({ c }) => !c.exec).map(({ c }) => proxima(c)).filter((x) => /^\d/.test(x) && !x.includes('vencida')).sort()
    return { srv, parado: parado(srv), bat: parado(srv) ? 'sem sinal há 4 min' : `há ${[12, 8, 15, 9][i]} s`, n, docs, prox: parado(srv) ? 'vencida há 6 min' : horas[0] || '—' }
  })
}
const SIMB = { ok: '○ aguardando', exec: '◐ executando', pausa: '‖ pausados', vinc: '▲ sem vínculo', bloq: '■ bloqueado', erro: '✕ erro' }

function ordenar(lista, ordem) {
  const val = { nome: (p) => p.nome, nfe: (p) => -p.cont.nfe, nfce: (p) => -p.cont.nfce, cte: (p) => -p.cont.cte, nfse: (p) => -p.cont.nfse, ev: (p) => -p.cont.ev, estado: (p) => pior(p) }
  const f = val[ordem] || val.estado
  return [...lista].sort((a, b) => (f(a) < f(b) ? -1 : f(a) > f(b) ? 1 : a.nome.localeCompare(b.nome)))
}
function filtrar(lista, f) {
  const q = f.busca.trim().toLowerCase()
  return lista.filter((p) => {
    if (q && !(p.nome.toLowerCase().includes(q) || p.docFull.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§') || p.docMasc.includes(q))) return false
    if (f.filtro === 'problema') return comProblema(p)
    if (f.filtro === 'pausados') return p.cursores.some((c) => c.pausado)
    if (f.filtro === 'semnotas') return total(p) === 0
    return true
  })
}
const filtros = (lista, f, a) => [['todos', 'Todos', lista.length], ['problema', 'Com problema', lista.filter(comProblema).length], ['pausados', 'Pausados', lista.filter((p) => p.cursores.some((c) => c.pausado)).length], ['semnotas', 'Sem notas', lista.filter((p) => total(p) === 0).length]]
  .map(([k, n, c]) => chip(`${n} ${c}`, f.filtro === k, a, `data-k="${k}"`))

function celula(p, c) {
  const e = est(p, c)
  return html`<span class="st ${e.cls}">${e.sim} ${e.txt}</span><small class="mono">${e.det ? e.det : `NSU ${fmtNum(c.nsu)} · ${proxima(c)}`}</small>`
}
const th = (k, nome, ordem, cls = '') => html`<th class="${cls}" aria-sort="${ordem === k ? 'ascending' : 'none'}"><button type="button" data-a="ordenar" data-k="${k}">${nome}${ordem === k ? ' ▲' : ''}</button></th>`

const vPainel = guarda(() => {
  const P = S.painel
  const todos = prods()
  const lista = ordenar(filtrar(todos, P), P.ordem)
  const pag = Math.min(P.pag, Math.max(1, Math.ceil(lista.length / POR_PAG)))
  const ags = agentes(), al = alertas()
  const linhas = lista.slice((pag - 1) * POR_PAG, pag * POR_PAG).map((p) => html`<tr data-a="abrir" data-id="${p.id}">
    <td><button type="button" class="lnk" data-a="abrir" data-id="${p.id}">${p.nome}</button><small class="mono">${p.docMasc}</small></td>
    <td class="num">${fmtNum(p.cont.nfe)}</td><td class="num">${fmtNum(p.cont.nfce)}</td><td class="num">${fmtNum(p.cont.cte)}</td><td class="num">${fmtNum(p.cont.nfse)}</td><td class="num">${fmtNum(p.cont.ev)}</td>
    ${p.cursores.map((c) => html`<td>${celula(p, c)}</td>`)}</tr>`)
  return html`<h2 class="sr">Painel</h2>
  <div class="ags">${ags.map((a) => html`<article class="cartao ${a.parado ? 'parado' : ''}"><h3>${a.srv} <span class="chip ${a.parado ? 'erro' : 'ok'}">${a.parado ? '✕ Parado' : '● Ativo'}</span></h3>
    <p class="suave">Batimento ${a.bat}</p>
    <p>${Object.keys(SIMB).filter((k) => a.n[k]).map((k) => `${a.n[k]} ${k === 'vinc' && a.srv === 'NFS-e' ? '▲ sem procuração' : SIMB[k]}`).join(' · ') || '—'}</p>
    <p class="suave">Próxima: <b class="mono">${a.prox}</b> · Documentos: <b class="mono">${fmtNum(a.docs)}</b></p>${a.srv === 'NFS-e' ? html`<p class="suave"><small>Consulta ao ADN nacional. A espera de 12 h é definida pelo sistema: o ADN não informa limite.</small></p>` : ''}</article>`)}</div>
  <div class="sec"><h2>Precisa de atenção</h2></div>
  ${al.length ? html`<ul class="alertas">${al.map((x) => html`<li class="${x.k}"><span>${x.sim}</span><span>${x.txt}</span>${x.link ? html`<a href="${x.link[0]}">${x.link[1]}</a>` : ''}</li>`)}</ul>` : html`<div class="vazio">○ Nada exige a sua atenção agora.</div>`}
  <div class="sec"><h2>Produtores</h2></div>
  <div class="barra"><label>Buscar nome ou documento<input type="search" id="busca-p" value="${P.busca}" data-f="busca-p" autocomplete="off"></label>
    ${filtros(todos, P, 'filtro-p')}<button type="button" class="ml" data-a="exportar" data-n="${lista.length}">Exportar CSV</button></div>
  ${tabela(html`${th('nome', 'Produtor', P.ordem)}${th('nfe', 'NF-e', P.ordem, 'num')}${th('nfce', 'NFC-e', P.ordem, 'num')}${th('cte', 'CT-e', P.ordem, 'num')}${th('nfse', 'NFS-e', P.ordem, 'num')}${th('ev', 'Eventos', P.ordem, 'num')}<th>NF-e</th><th>NFC-e</th><th>CT-e</th><th>NFS-e</th>`, linhas, 'Produtores e estado da captura por serviço', todos.length ? 'Nenhum produtor para esse filtro.' : html`Nenhum produtor cadastrado.<br>A captura começa quando você cadastrar o primeiro.<br><br><button type="button" class="p" data-a="novo">+ Novo produtor</button>`)}
  ${pagina(lista.length, pag, POR_PAG, 'pag-p')}
  <p class="suave">Ordem padrão: o que exige ação sobe. Clique numa linha para abrir o produtor.</p>`
})

// ---------- T6 Produtores ----------
const vProdutores = guarda(() => {
  const P = S.prods
  const todos = prods()
  const lista = filtrar(todos, P).sort((a, b) => a.nome.localeCompare(b.nome))
  const pag = Math.min(P.pag, Math.max(1, Math.ceil(lista.length / POR_PAG)))
  const linhas = lista.slice((pag - 1) * POR_PAG, pag * POR_PAG).map((p) => html`<tr data-a="abrir" data-id="${p.id}">
    <td><button type="button" class="lnk" data-a="abrir" data-id="${p.id}">${p.nome}</button></td><td class="mono">${p.docMasc}</td><td>${p.municipio ?? '—'}</td>
    <td><span class="st ${p.semVinculo ? 'aviso' : 'ok'}">${p.semVinculo ? '▲' : p.cursores[0].cstat == null ? '○' : '●'} ${vinculo(p)}</span></td><td><span class="st ${p.semProcuracao ? 'aviso' : 'ok'}">${p.semProcuracao ? '▲' : p.cursores[3].cstat == null ? '○' : '●'} ${procuracao(p)}</span></td><td>NF-e · NFC-e · CT-e · NFS-e</td><td class="num">${fmtNum(total(p))}</td><td>${p.ultima ?? '—'}</td><td>${p.cadastro}</td></tr>`)
  return html`<div class="barra"><h2>Produtores</h2><label>Buscar nome ou documento<input type="search" id="busca-q" value="${P.busca}" data-f="busca-q" autocomplete="off"></label>
    ${filtros(todos, P, 'filtro-q')}<span class="ml"></span><button type="button" data-a="importar">Importar lista (CSV)</button><button type="button" class="p" data-a="novo">+ Novo produtor</button></div>
  ${tabela(html`<th>Produtor</th><th>Documento</th><th>Município</th><th>Vínculo (SAT)</th><th>Procuração (ADN)</th><th>Serviços</th><th class="num">Notas</th><th>Última nota</th><th>Cadastrado em</th>`, linhas, 'Lista de produtores', todos.length ? 'Nenhum produtor para esse filtro.' : html`Nenhum produtor.<br><br><button type="button" class="p" data-a="novo">+ Novo produtor</button> <button type="button" data-a="importar">Importar lista</button>`)}
  ${pagina(lista.length, pag, POR_PAG, 'pag-q')}
  <p class="suave">Vínculo é inferido do último cStat da SEF-SC (8002 = sem vínculo) e a procuração, da última resposta do ADN (E2245 = sem procuração); nenhum dos dois é leitura do cadastro do SAT ou do ADN.</p>`
})

// ---------- T4 Notas e T5 Detalhe ----------
const idNota = (n) => n.chave + (n.tipo === 'Evento' ? 'E' : '')
const botaoChave = (n) => html`<button type="button" data-a="copiar" data-v="${n.chave}" aria-label="Copiar a chave de acesso da nota ${n.numero}">Copiar chave de acesso …${n.chave.slice(-4)}</button>`
const notasFiltradas = () => {
  const F = S.notas
  const q = F.chave.replace(/\s/g, '')
  return notasTodas().filter((n) => (!F.prod || n.prodId === +F.prod || (F.lig && X.ligados(+F.prod).includes(n.prodId))) && (!F.tipo || (F.tipo === 'Evento' ? n.tipo === 'Evento' : n.tipo === F.tipo)) && (!F.cfop || n.categoria === F.cfop) && (!F.comp || n.emissao === F.comp) && (!F.sit || n.situacao === F.sit) && (!q || n.chave.includes(q)))
}
const vNotas = guarda(() => {
  const F = S.notas
  const lista = notasFiltradas()
  const mostra = lista.slice(0, F.mostrar)
  const compInvalida = F.comp && !/^\d{4}-\d{2}$/.test(F.comp)
  const linhas = mostra.map((n) => { const p = D.produtores.find((x) => x.id === n.prodId); return html`<tr>
    <td><input type="checkbox" data-f="n-sel" data-v="${idNota(n)}" aria-label="Selecionar a nota ${n.numero}" ${raw(F.sel.includes(idNota(n)) ? 'checked' : '')}></td>
    <td>${p?.nome}<small class="mono">${p?.docMasc}</small>${F.lig && X.ligados(n.prodId).length > 1 ? html`<small>ligado a ${X.ligados(n.prodId).length} CNPJs: a nota conta uma vez</small>` : ''}</td>
    <td>${n.tipo === 'Evento' ? html`Evento · <span class="mono">${n.evento}</span><small>${EV_DESC[n.evento]} da NF-e ${n.numero}/${n.serie}</small>` : n.tipo === 'NFS-e' ? html`NFS-e<small>${n.papel} · padrão nacional</small>` : n.tipo}</td>
    <td>${n.cfop ? html`<span class="mono">${n.cfop}</span><small>${n.categoria}</small>` : '—'}</td>
    <td class="num"><a href="#/notas/${n.chave}" aria-label="Abrir a nota ${n.tipo} ${n.numero}">${n.tipo === 'Evento' ? '—' : n.serie == null ? n.numero : `${n.numero} / ${n.serie}`}</a></td><td class="mono">${n.emissao}</td>
    <td>${n.tipo === 'Evento' ? '—' : html`<span class="st ${n.situacao === 'Cancelada' ? 'erro' : 'ok'}">${n.situacao === 'Cancelada' ? '✕ Cancelada' : 'Autorizada'}</span>`}</td>
    <td class="num">${n.nsu == null ? '—' : fmtNum(n.nsu)}</td><td>${n.cap}${n.origem ? html`<small>${n.origem}, sem NSU</small>` : ''}</td>
    <td><button type="button" data-a="baixar" aria-label="Baixar o XML da nota ${n.numero}">XML ↓</button></td><td>${botaoChave(n)}</td></tr>` })
  const nSel = F.sel.length
  return html`<h2 class="sr">Notas</h2>
  <div class="barra">
    <label>Produtor<select data-f="n-prod"><option value="">Todos</option>${prods().map((p) => html`<option value="${p.id}" ${raw(+F.prod === p.id ? 'selected' : '')}>${p.nome}</option>`)}</select></label>
    <label>Tipo<select data-f="n-tipo">${['', 'NF-e', 'NFC-e', 'CT-e', 'NFS-e', 'Evento'].map((t) => html`<option value="${t}" ${raw(F.tipo === t ? 'selected' : '')}>${t || 'Todos'}</option>`)}</select></label>
    <label>CFOP<select data-f="n-cfop">${['', ...CATEGORIAS_CFOP].map((t) => html`<option value="${t}" ${raw(F.cfop === t ? 'selected' : '')}>${t || 'Todos'}</option>`)}</select></label>
    <label>Competência (AAAA-MM)<input id="n-comp" data-f="n-comp" value="${F.comp}" placeholder="2026-10" size="8" ${raw(compInvalida ? 'aria-invalid="true"' : '')}></label>
    <label>Situação<select data-f="n-sit">${['', 'Autorizada', 'Cancelada'].map((t) => html`<option value="${t}" ${raw(F.sit === t ? 'selected' : '')}>${t || 'Todas'}</option>`)}</select></label>
    ${F.prod && X.ligados(+F.prod).length ? html`<label class="chk"><input type="checkbox" data-f="n-lig" ${raw(F.lig ? 'checked' : '')}> Incluir notas dos documentos ligados (${X.ligados(+F.prod).length})</label>` : ''}
    <label>Chave de acesso<input id="n-chave" data-f="n-chave" value="${F.chave}" size="40" placeholder="44 (NF-e, NFC-e, CT-e) ou 50 (NFS-e) caracteres, com ou sem espaços" class="mono"></label>
    <button type="button" data-a="limpar-notas">Limpar</button></div>
  ${compInvalida ? html`<p class="msg-erro" role="alert">Competência no formato AAAA-MM, por exemplo 2026-10.</p>` : ''}
  <div class="barra"><b>${fmtNum(lista.length)} notas</b><span class="suave">· mais recentes primeiro</span><span class="ml"></span>
    <span class="suave">${nSel} selecionada(s)</span>
    <button type="button" data-a="exportar" data-n="${nSel}" ${raw(nSel ? '' : 'disabled')}>Exportar CSV</button><button type="button" data-a="zip" data-n="${nSel}" ${raw(nSel ? '' : 'disabled')}>Baixar XML</button></div>
  ${tabela(html`<th><input type="checkbox" data-f="n-sel-todas" aria-label="Selecionar todas as notas listadas" ${raw(lista.length && lista.every((n) => F.sel.includes(idNota(n))) ? 'checked' : '')}></th><th>Produtor</th><th>Tipo</th><th>CFOP</th><th class="num">Nº / Série</th><th>Emissão</th><th>Situação</th><th class="num">NSU</th><th>Capturada em</th><th></th><th></th>`, linhas, 'Notas capturadas',
    notasTodas().length ? html`Nenhuma nota para esses filtros.<br><small>O serviço entrega só os últimos 3 meses; notas mais antigas precisam de <a href="#/importar">importação</a> (hipótese).</small><br><button type="button" data-a="limpar-notas">Limpar filtros</button>` : 'Nenhuma nota capturada ainda.')}
  <div class="pag"><span>Mostrando ${mostra.length} de ${fmtNum(lista.length)}</span>${lista.length > mostra.length ? html`<button type="button" data-a="mais">Carregar mais</button>` : ''}</div>`
})

const vDetalhe = guarda((R) => {
  const chave = R.sub.replace(/\s/g, '')
  const todas = notasTodas().filter((n) => n.chave === chave)
  const n = todas.find((x) => x.tipo !== 'Evento')
  if (!n) return html`<p><a href="#/notas">← Notas</a></p><div class="caixa-erro" role="alert">Nota não encontrada nas notas capturadas.</div>`
  const evs = todas.filter((x) => x.tipo === 'Evento')
  const p = D.produtores.find((x) => x.id === n.prodId)
  const canc = evs.find((e) => e.evento === 110111)
  return html`<p><a href="#/notas">← Notas</a> <span class="suave">› ${p.nome} › ${n.tipo} ${n.serie == null ? n.numero : `${n.numero}/${n.serie}`}</span></p>
  <div class="barra"><h2 class="mono" style="word-break:break-all">${fmtChave(n.chave)}</h2><button type="button" data-a="copiar" data-v="${n.chave}">⧉ Copiar</button></div>
  <div class="barra"><span class="chip">${n.tipo === 'NFS-e' ? 'NFS-e · padrão nacional (ADN)' : `${n.tipo} · modelo ${n.modelo}`}</span>
    <span class="chip ${canc ? 'erro' : 'ok'}">${canc ? `✕ Cancelada (evento 110111, capturado em ${canc.cap})` : '● Autorizada'}</span>
    ${X.btnManif(n)}<span class="ml"></span><button type="button" class="p" data-a="baixar">Baixar XML</button></div>
  <div class="dois">
    <section class="cartao" aria-label="Identificação"><h3>Identificação <small style="display:inline">(lida da chave)</small></h3>
      ${n.tipo === 'NFS-e' ? html`<dl class="kv"><dt>Município (cLocEmi)</dt><dd class="mono">${n.chave.slice(0, 7)}</dd><dt>Emissão</dt><dd class="mono">${n.emissao}</dd><dt>Emitente</dt><dd class="mono">**.${n.chave.slice(11, 14)}.${n.chave.slice(14, 17)}/**** (mascarado)</dd><dt>Papel do produtor</dt><dd>${n.papel}</dd><dt>Número</dt><dd class="mono">${n.numero}</dd></dl>` : html`<dl class="kv"><dt>UF</dt><dd>42 (SC)</dd><dt>Emissão</dt><dd class="mono">${n.emissao}</dd><dt>Emitente</dt><dd class="mono">${n.chave.slice(6, 8)}.${n.chave.slice(8, 11)}.${n.chave.slice(11, 14)}/**** (mascarado)</dd><dt>Modelo / Série</dt><dd class="mono">${n.modelo} / ${n.serie}</dd><dt>Número</dt><dd class="mono">${n.numero}</dd></dl>`}</section>
    <section class="cartao" aria-label="Captura"><h3>Captura</h3>
      <dl class="kv"><dt>Produtor</dt><dd><a href="#/notas/${n.chave}?produtor=${p.id}">${p.nome}</a></dd><dt>Serviço</dt><dd>${n.tipo === 'NFS-e' ? 'NFS-e (ADN: tomador, prestador ou intermediário)' : `${n.tipo} (emitente ou destinatário)`}</dd><dt>NSU</dt><dd class="mono">${n.nsu == null ? '— (importada)' : fmtNum(n.nsu)}</dd><dt>Capturada em</dt><dd>${n.cap}</dd><dt>Consulta</dt><dd>${n.tipo === 'NFS-e' ? 'ADN · HTTP 200 · lote de 50' : 'cStat 118 · lote de 50'}</dd></dl></section></div>
  <div class="sec"><h2>Eventos desta nota</h2></div>
  ${evs.length ? tabela(html`<th>Evento</th><th>Descrição</th><th class="num">NSU</th><th>Capturado em</th><th></th>`, evs.map((e) => html`<tr><td class="mono">${e.evento}</td><td>${EV_DESC[e.evento]}</td><td class="num">${e.nsu}</td><td>${e.cap}</td><td><button type="button" data-a="baixar">XML ↓</button></td></tr>`), 'Eventos da nota', '') : html`<div class="vazio">Nenhum evento capturado para esta nota.<br><small>${n.tipo === 'NFS-e' ? 'O ADN também distribui eventos da NFS-e (ex.: cancelamento); esta tela ainda não os desenha.' : 'Eventos aparecem com ao menos 24 h de atraso na NF-e.'}</small></div>`}
  <p class="cartao" style="margin-top:12px"><b>Arquivo original</b> · guardado íntegro desde ${n.cap}. O XML nunca é exibido na página, só baixado.<br><small>Nome do emitente e do destinatário, valores, itens e tributos exigem ler o XML (módulo de apuração) e ficam fora do MVP de captura.</small></p>`
})

// ---------- T3 Falhas ----------
const vFalhas = guarda(() => {
  const F = S.falhas
  const agir = prods().filter((p) => p.semVinculo)
  const proc = prods().filter((p) => p.semProcuracao)
  const sist = SIM.cenario === 'bloqueio' ? 1 : 0
  const mostraAgir = F.aba !== 'sistema', mostraSist = F.aba !== 'agir'
  const sel = agir.filter((p) => F.sel.has(p.id))
  const algo = (mostraAgir && (agir.length || proc.length)) || (mostraSist && sist)
  return html`<div class="barra"><h2>Falhas</h2>${chip(`Preciso agir ${agir.length + proc.length}`, F.aba === 'agir', 'aba-f', 'data-k="agir"')}${chip(`O sistema resolve sozinho ${sist}`, F.aba === 'sistema', 'aba-f', 'data-k="sistema"')}${chip(`Todas ${agir.length + proc.length + sist}`, F.aba === 'todas', 'aba-f', 'data-k="todas"')}</div>
  ${!algo ? html`<div class="vazio">✓ Nenhuma falha${F.aba === 'agir' ? ' que dependa de você' : ''}. Todos os cursores estão aguardando ou executando.</div>` : ''}
  ${mostraAgir && agir.length ? html`<section class="cartao grupo" aria-label="Sem vínculo">
    <h3>▲ Sem vínculo na SEF-SC (cStat 8002) · ${agir.length} produtor${agir.length > 1 ? 'es' : ''} <span class="chip aviso">Ação do contador</span></h3>
    <p class="suave">A SEF-SC só entrega as notas de quem o contador tem vínculo. Isto é cadastro no SAT, não falha do sistema.</p>
    <ol><li>Cadastrar o vínculo no SAT (aplicação de credenciamento para contabilistas).</li><li>Voltar aqui, marcar os produtores e pedir "Tentar novamente".</li></ol>
    <div class="barra"><button type="button" class="p" data-a="tentar-sel" ${raw(sel.length ? '' : 'disabled')}>Tentar novamente nos selecionados (${sel.length})</button><button type="button" data-a="copiar-docs">Copiar documentos</button></div>
    ${tabela(html`<th><input type="checkbox" data-f="f-todos" aria-label="Selecionar todos" ${raw(sel.length === agir.length ? 'checked' : '')}></th><th>Produtor</th><th>Documento</th><th>Serviços</th><th>Parado desde</th><th>Última resposta da SEF-SC</th><th></th>`,
      agir.map((p) => html`<tr><td><input type="checkbox" data-f="f-sel" value="${p.id}" aria-label="Selecionar ${p.nome}" ${raw(F.sel.has(p.id) ? 'checked' : '')}></td>
        <td><button type="button" class="lnk" data-a="abrir" data-id="${p.id}">${p.nome}</button></td><td class="mono">${p.docFull}</td><td>${sefsc(p).some((c) => c.exec) ? '◐ Consultando…' : 'NF-e · NFC-e · CT-e'}</td><td>${p.cursores[0].exec ? '—' : '19/11 09:10'}</td><td>8002 · ${XMOTIVO[8002]}</td>
        <td><button type="button" data-a="tentar" data-id="${p.id}" ${raw(p.cursores.some((c) => c.exec) ? 'disabled' : '')}>Tentar novamente</button></td></tr>`), 'Produtores sem vínculo', '')}</section>` : ''}
  ${mostraAgir && proc.length ? html`<section class="cartao grupo" aria-label="Sem procuração">
    <h3>▲ Sem procuração no ADN (E2245) · ${proc.length} produtor${proc.length > 1 ? 'es' : ''} <span class="chip aviso">Ação do contador</span></h3>
    <p class="suave">O ADN só entrega a NFS-e de quem tem procuração para o certificado do contador. Isto é cadastro, não falha do sistema. As notas de NF-e, NFC-e e CT-e deste produtor não são afetadas.</p>
    <ol><li>Cadastrar a procuração do produtor para o contador no ADN (onde isso é feito ainda é pergunta em aberto para o contador).</li><li>Voltar aqui e pedir "Tentar novamente".</li></ol>
    ${tabela(html`<th>Produtor</th><th>Documento</th><th>Parado desde</th><th>Última resposta do ADN</th><th></th>`,
      proc.map((p) => html`<tr><td><button type="button" class="lnk" data-a="abrir" data-id="${p.id}">${p.nome}</button></td><td class="mono">${p.docFull}</td><td>${p.cursores[3].exec ? '—' : '19/11 09:10'}</td><td>${p.cursores[3].exec ? '◐ Consultando…' : `E2245 · ${XMOTIVO.E2245}`}</td>
        <td><button type="button" data-a="tentar-proc" data-id="${p.id}" ${raw(p.cursores[3].exec ? 'disabled' : '')}>Tentar novamente</button></td></tr>`), 'Produtores sem procuração', '')}</section>` : ''}
  ${mostraSist && sist ? html`<section class="cartao grupo sistema" aria-label="Bloqueio"><h3>■ Bloqueio por excesso de consultas (657) · serviço NFC-e <span class="chip">O sistema resolve sozinho</span></h3>
    <p>Nada a fazer. As consultas de NFC-e voltam sozinhas às <b>15:40</b>. O bloqueio vale para o certificado inteiro; insistir só prolonga a espera.</p></section>` : ''}
  <section class="cartao grupo"><h3>✕ Erro inesperado · 0</h3><small>Mostraria a resposta literal da SEF-SC e "se persistir, avise o desenvolvedor".</small></section>`
})

// ---------- T12 Importações ----------
const vImport = guarda(() => {
  const I = S.imp
  const tent = (SIM.cenario === 'vazio' ? [] : D.tentativas).filter((t) => (!I.prod || t.prodId === +I.prod) && (!I.soProblema || t.cstat === 8002 || t.cstat === 657 || t.cstat === 'E2245'))
  const cmds = (SIM.cenario === 'vazio' ? [] : D.comandos).filter((c) => !I.prod || c.prod === D.produtores.find((p) => p.id === +I.prod)?.nome)
  const res = (t) => (t.cstat === 'E2245' ? '▲ Sem procuração' : t.cstat === 8002 ? '▲ Sem vínculo' : t.cstat === 657 ? '■ Bloqueio' : t.cstat === 117 || t.cstat === 'E2220' ? '○ Em dia' : '○ Ok')
  return html`<div class="barra"><h2>Importações e auditoria</h2>${chip('Consultas à SEF-SC e ao ADN', I.aba === 'consultas', 'aba-i', 'data-k="consultas"')}${chip('Comandos', I.aba === 'comandos', 'aba-i', 'data-k="comandos"')}${chip('Arquivos importados', I.aba === 'arquivos', 'aba-i', 'data-k="arquivos"')}<span class="hipt">hipótese</span><span class="ml"></span><a href="#/importar" class="btn-lnk">+ Importar</a></div>
  <div class="barra"><label>Período<select disabled><option>Hoje</option></select></label>
    <label>Produtor<select data-f="i-prod"><option value="">Todos</option>${prods().map((p) => html`<option value="${p.id}" ${raw(+I.prod === p.id ? 'selected' : '')}>${p.nome}</option>`)}</select></label>
    ${I.aba === 'consultas' ? html`<label class="chk"><input type="checkbox" data-f="i-so" ${raw(I.soProblema ? 'checked' : '')}> Só com problema</label>` : ''}
    <button type="button" class="ml" data-a="exportar" data-n="${I.aba === 'consultas' ? tent.length : cmds.length}">Exportar CSV</button></div>
  ${I.aba === 'arquivos' ? X.vArquivos() : I.aba === 'consultas'
    ? tabela(html`<th>Hora</th><th>Produtor</th><th>Serviço</th><th>cStat / ADN</th><th>Resposta da SEF-SC ou do ADN</th><th class="num">Docs</th><th class="num">NSU</th><th>Resultado</th>`,
      tent.map((t) => html`<tr><td>${t.hora}</td><td>${t.prod}</td><td>${t.serv}</td><td class="mono">${t.cstat}</td><td>${XMOTIVO[t.cstat]}</td><td class="num">${t.docs}</td><td class="num">${t.nsu}</td><td>${res(t)}</td></tr>`), 'Consultas à SEF-SC e ao ADN', 'Nenhuma consulta neste período.')
    : tabela(html`<th>Quando</th><th>Comando</th><th>Produtor · serviço</th><th>Motivo</th><th>Origem</th><th>Resultado</th>`,
      cmds.map((c) => html`<tr><td>${c.quando}</td><td><b>${c.cmd}</b></td><td>${c.prod} · ${c.serv}</td><td>${c.motivo}</td><td class="mono">${c.origem}</td><td>${c.res}</td></tr>`), 'Comandos', 'Nenhum comando registrado.')}
  ${I.aba === 'comandos' ? html`<p class="suave">Origem é só "token": sem login, o sistema não sabe quem pediu. Decisão em aberto: aceitar assim ou pedir um campo "responsável".</p>` : ''}`
})

// ---------- T2 Gaveta ----------
function vGaveta(p) {
  const f = S.form || {}
  const tentativas = D.tentativas.filter((t) => t.prodId === p.id).slice(0, 5)
  const razao = (c) => ({ vinc: c.servico === 'NFS-e' ? 'sem procuração: cadastre no ADN primeiro' : 'sem vínculo: cadastre no SAT primeiro', pausa: 'pausado: retome antes de sincronizar', bloq: 'bloqueado até 15:40: excesso de consultas, o sistema espera sozinho', exec: 'já executando' })[est(p, c).k]
  const rotulo = { SINCRONIZAR_AGORA: 'Sincronizar agora', PAUSAR: 'Pausar', RETOMAR: 'Retomar' }
  return html`<div class="cortina" data-a="fechar"></div>
  <aside class="gaveta" role="dialog" aria-modal="true" aria-labelledby="g-tit" tabindex="-1" id="gaveta">
    <div class="barra"><h2 id="g-tit">${p.nome}</h2><span class="mono">${p.docFull}</span><span class="suave">(documento inteiro só aqui)</span><button type="button" class="ml" data-a="fechar">Fechar ✕</button></div>
    <div class="barra"><span class="chip ${p.semVinculo ? 'aviso' : 'ok'}">Vínculo (SAT): ${vinculo(p)}</span><span class="chip ${p.semProcuracao ? 'aviso' : 'ok'}">Procuração (ADN): ${procuracao(p)}</span><a href="#/notas">Ver notas deste produtor →</a>${X.chipLig(p)}<a href="#/importacoes">Histórico de comandos →</a></div>
    ${p.semVinculo ? html`<div class="caixa-erro" style="font-weight:400">▲ A SEF-SC não reconhece o vínculo. É cadastro no SAT, não falha do sistema. Depois do cadastro, use "Tentar novamente" em <a href="#/falhas">Falhas</a>.</div>` : ''}
    ${p.semProcuracao ? html`<div class="caixa-erro" style="font-weight:400">▲ O ADN não encontra procuração deste produtor para o certificado do contador (E2245). A NFS-e dele não é capturada; NF-e, NFC-e e CT-e seguem normais. Onde a procuração é cadastrada ainda é pergunta em aberto para o contador. Depois, use "Tentar novamente" em <a href="#/falhas">Falhas</a>.</div>` : ''}
    <div class="sec"><h3>Cursores</h3></div>
    ${tabela(html`<th>Serviço</th><th>Papel</th><th>Estado</th><th class="num">Último NSU</th><th>Próxima</th><th>cStat / ADN</th><th>Sync completo</th><th>Ações</th>`,
      p.cursores.map((c) => { const e = est(p, c), r = razao(c); return html`<tr><td>${c.servico}</td><td>${c.servico === 'NFS-e' ? 'Todos os papéis (tomador, prestador, intermediário)' : 'Emitente ou destinatário'}</td><td><span class="st ${e.cls}">${e.sim} ${e.txt}</span>${e.det ? html`<small>${e.det}</small>` : ''}</td>
        <td class="num">${fmtNum(c.nsu)}</td><td class="mono">${proxima(c)}</td><td class="mono">${c.cstat ?? '—'}</td><td>${c.sync ?? '—'}</td>
        <td>${c.pausado ? html`<button type="button" data-a="cmd" data-srv="${c.servico}" data-t="RETOMAR">Retomar</button>` : html`<button type="button" data-a="cmd" data-srv="${c.servico}" data-t="PAUSAR">Pausar</button>`}
          <button type="button" data-a="cmd" data-srv="${c.servico}" data-t="SINCRONIZAR_AGORA" ${raw(r ? 'disabled' : '')} ${raw(r ? `aria-describedby="r-${c.servico}"` : '')}>Sincronizar agora</button>${r ? html`<small id="r-${c.servico}">${r}</small>` : ''}</td></tr>` }), 'Cursores do produtor', '')}
    ${S.cmd ? html`<form class="form" data-s="cmd"><b>${rotulo[S.cmd.tipo]}: ${S.cmd.srv}</b>
      <label>Motivo (obrigatório)<input id="g-motivo" name="motivo" value="${f.motivo ?? ''}" size="34" ${raw(f.erro ? 'aria-invalid="true"' : '')}></label>
      <button type="submit" class="p">Confirmar</button><button type="button" data-a="cmd-cancelar">Cancelar</button>${f.erro ? html`<span class="msg-erro" role="alert">${f.erro}</span>` : ''}</form>` : ''}
    <div class="sec"><h3>Últimas tentativas</h3></div>
    ${tentativas.length ? tabela(html`<th>Hora</th><th>Serviço</th><th>cStat / ADN</th><th>Resposta da SEF-SC ou do ADN</th><th class="num">Docs</th>`, tentativas.map((t) => html`<tr><td>${t.hora}</td><td>${t.serv}</td><td class="mono">${t.cstat}</td><td>${XMOTIVO[t.cstat]}</td><td class="num">${t.docs}</td></tr>`), 'Últimas tentativas', '') : html`<div class="vazio">Ainda não houve consulta para este produtor.<br>A primeira roda em instantes.</div>`}
    <div class="risco-box"><h3>Zona de risco · Redefinir NSU</h3>
      <p class="suave">Volta o marcador do cursor e baixa de novo notas já capturadas (o sistema evita duplicar), gastando consultas. Use só para recuperar de erro.</p>
      ${S.redef ? html`<form class="form" data-s="redef">
        <label>Cursor<select name="srv">${SERV.map((s) => html`<option ${raw(f.srv === s ? 'selected' : '')}>${s}</option>`)}</select></label>
        <label>Novo NSU<input name="nsu" inputmode="numeric" size="8" value="${f.nsu ?? ''}"></label>
        <label>Digite o documento mascarado<input name="doc" size="18" class="mono" value="${f.doc ?? ''}" placeholder="${p.docMasc}"></label>
        <label>Motivo<input name="motivo" size="22" value="${f.motivo ?? ''}"></label>
        <button type="submit" class="risco">Redefinir</button><button type="button" data-a="redef-cancelar">Cancelar</button>${f.erro ? html`<span class="msg-erro" role="alert">${f.erro}</span>` : ''}</form>`
        : html`<button type="button" class="risco" data-a="redef">Redefinir NSU…</button>`}</div>
  </aside>`
}

// ---------- diálogo Novo produtor ----------
function vNovo() {
  const f = S.form || {}
  return html`<div class="cortina" data-a="fechar"></div>
  <form class="dlg" role="dialog" aria-modal="true" aria-labelledby="d-tit" tabindex="-1" id="dlg" data-s="novo">
    <h2 id="d-tit">Novo produtor</h2>
    <label style="margin-top:10px">Documento (CPF de 11 dígitos ou CNPJ de 14 posições alfanuméricas)<input id="d-doc" name="doc" class="mono" value="${f.doc ?? ''}" autocomplete="off" ${raw(f.erro ? 'aria-invalid="true" aria-describedby="d-erro"' : '')}></label>
    ${f.erro ? html`<p class="msg-erro" id="d-erro" role="alert">${f.erro}</p>` : ''}
    <p class="suave">Ao cadastrar, o sistema cria o produtor com o nome provisório "Aguardando primeira nota", usa o certificado A1 ativo e abre a captura de NF-e e de NFS-e. O nome e o município vêm da primeira nota. <b>Sem vínculo no SAT a SEF-SC responde 8002 e nada é baixado; sem procuração no ADN a NFS-e fica suspensa (E2245).</b></p>
    <p class="suave">Neste protótipo, use um documento fictício.</p>
    <div class="form"><button type="submit" class="p">Cadastrar</button><button type="button" data-a="fechar">Cancelar</button></div></form>`
}

// ---------- renderização ----------
let eraAberto = false
function render() {
  const R = rota()
  const gid = R.q.get('produtor')
  const g = gid ? D.produtores.find((p) => p.id === +gid) : null
  const aberto = !!g || !!S.dlg
  const ativo = document.activeElement
  const keep = ativo && ativo.id && ativo.closest('#app') ? { id: ativo.id, a: ativo.selectionStart, b: ativo.selectionEnd } : null
  const tela = R.r === 'certificados' ? X.vCert(R) : R.r === 'importar' ? X.vImportar(R) : R.r === 'vinculos' ? X.vVinculos(R) : R.r === 'manifestacao' ? X.vManif(R) : R.r === 'produtores' ? vProdutores(R) : R.r === 'notas' ? (R.sub ? vDetalhe(R) : vNotas(R)) : R.r === 'falhas' ? vFalhas(R) : R.r === 'importacoes' ? vImport(R) : vPainel(R)
  document.getElementById('app').innerHTML = html`<div id="base" ${raw(aberto ? 'inert' : '')}>${vTopo(R)}<main id="conteudo" tabindex="-1">${tela}</main></div>${g ? vGaveta(g) : ''}${S.dlg === 'novo' ? vNovo() : X.dlg()}`.s
  if (aberto && !eraAberto) (document.getElementById(g ? 'gaveta' : 'dlg'))?.focus()
  else if (!aberto && eraAberto && S.foco) document.querySelector(S.foco)?.focus()
  else if (keep) { const el = document.getElementById(keep.id); if (el) { el.focus(); try { el.setSelectionRange(keep.a, keep.b) } catch { /* campo sem seleção */ } } }
  eraAberto = aberto
  if (!aberto) S.foco = null
}

// ---------- ações ----------
const prod = (id) => D.produtores.find((p) => p.id === +id)
const logCmd = (p, c, cmd, motivo, res) => D.comandos.unshift({ quando: `19/11 ${AGORA}`, cmd, prod: p.nome, serv: c ? c.servico : '—', motivo, origem: 'token', res })
const logTent = (p, c, cstat) => D.tentativas.unshift({ hora: AGORA, prodId: p.id, prod: p.nome, serv: c.servico, cstat, docs: 0, nsu: '—' })
function toast(msg) {
  const t = document.createElement('div')
  t.className = 'toast'; t.textContent = msg
  document.getElementById('toasts').append(t)
  document.getElementById('aviso-vivo').textContent = msg
  setTimeout(() => t.remove(), 4500)
}
const fechar = () => { X.reset(); S.dlg = null; S.cmd = null; S.redef = false; S.form = null; irPara(rota(), (q) => q.delete('produtor')); render() }
const pag = (obj, d) => { obj.pag = Math.max(1, obj.pag + +d); render() }

function resultadoVinculo(ps) {
  let ok = 0
  ps.forEach((p) => {
    sefsc(p).forEach((c) => { c.exec = false })
    if (SIM.vincOk) { p.semVinculo = false; ok++; sefsc(p).forEach((c) => { c.cstat = 117; c.sync = `19/11 ${AGORA}`; logTent(p, c, 117) }) }
    else sefsc(p).forEach((c) => { c.cstat = 8002; logTent(p, c, 8002) })
  })
  toast(ok ? `${ok} produtor${ok > 1 ? 'es' : ''} com vínculo ok: captura liberada.` : 'Continua sem vínculo. Confirme o cadastro no SAT e tente de novo.')
}
function tentar(ids) {
  const ps = ids.map(prod).filter(Boolean)
  ps.forEach((p) => { sefsc(p).forEach((c) => { c.exec = true }); logCmd(p, null, 'Retomar (tentar novamente)', 'vínculo cadastrado no SAT', 'Pedido') })
  render()
  setTimeout(() => { resultadoVinculo(ps); S.falhas.sel.clear(); render() }, 2000)
}
function tentarProc(id) {
  const p = prod(id), c = p.cursores[3]
  c.exec = true; logCmd(p, c, 'Retomar (tentar novamente)', 'procuração cadastrada no ADN', 'Pedido')
  render()
  setTimeout(() => {
    c.exec = false
    if (SIM.procOk) { p.semProcuracao = false; c.cstat = 'E2220'; c.sync = `19/11 ${AGORA}`; logTent(p, c, 'E2220'); toast(`${p.nome}: procuração ok, a NFS-e será capturada.`) }
    else { c.cstat = 'E2245'; logTent(p, c, 'E2245'); toast('Continua sem procuração (E2245). Confirme o cadastro e tente de novo.') }
    render()
  }, 2000)
}
function executar(p, c, tipo, motivo) {
  const nome = { PAUSAR: 'Pausar', RETOMAR: 'Retomar', SINCRONIZAR_AGORA: 'Sincronizar agora' }[tipo]
  if (tipo === 'PAUSAR') { c.pausado = { motivo, quando: `19/11 ${AGORA}`, por: 'token' }; logCmd(p, c, nome, motivo, 'Executado'); toast(`${c.servico} de ${p.nome} pausado.`) }
  else if (tipo === 'RETOMAR') { c.pausado = null; logCmd(p, c, nome, motivo, 'Executado'); toast(`${c.servico} de ${p.nome} retomado.`) }
  else if (parado(c.servico)) { logCmd(p, c, nome, motivo, 'Pedido (agente parado)'); toast('Pedido registrado, mas o agente CT-e está parado: a consulta fica na fila até ele voltar.') }
  else {
    c.exec = true; logCmd(p, c, nome, motivo, 'Pedido')
    const ok = c.servico === 'NFS-e' ? 'E2220' : 117
    setTimeout(() => { c.exec = false; c.cstat = ok; c.sync = `19/11 ${AGORA}`; logTent(p, c, ok); toast(`${c.servico}: ${ok} · ${XMOTIVO[ok]}.`); render() }, 2200)
  }
}
const copiar = (txt, msg) => { try { navigator.clipboard.writeText(txt).then(() => toast(msg), () => toast('Não foi possível copiar neste navegador.')) } catch { toast('Não foi possível copiar neste navegador.') } }

const X = instalar({ html, raw, tabela, chip, S, SIM, d: () => D, toast, render, guarda, prods, prod, est, vinculo, fmtNum, fmtChave, AGORA, CERT })

const AC = {
  ...X.AC,
  tema: () => { S.tema = TEMAS[(TEMAS.indexOf(S.tema) + 1) % 3]; aplicarTema(); render() },
  abrir: (el) => { S.foco = `button.lnk[data-id="${el.dataset.id}"]`; S.cmd = null; S.redef = false; S.form = null; irPara(rota(), (q) => q.set('produtor', el.dataset.id)) },
  fechar,
  retentar: () => { SIM.cenario = 'normal'; document.getElementById('cenario').value = 'normal'; render() },
  'filtro-p': (el) => { S.painel.filtro = el.dataset.k; S.painel.pag = 1; render() },
  'filtro-q': (el) => { S.prods.filtro = el.dataset.k; S.prods.pag = 1; render() },
  'pag-p': (el) => pag(S.painel, el.dataset.d),
  'pag-q': (el) => pag(S.prods, el.dataset.d),
  ordenar: (el) => { S.painel.ordem = el.dataset.k; render() },
  exportar: (el) => toast(`Protótipo: no sistema real baixaria um CSV com as ${el.dataset.n} notas selecionadas.`),
  zip: (el) => toast(`Protótipo: no sistema real baixaria um ZIP com os XMLs das ${el.dataset.n} notas selecionadas.`),
  baixar: () => toast('Protótipo: no sistema real baixaria o arquivo XML original.'),
  importar: () => toast('Protótipo: importação de lista ainda é hipótese (depende do contador).'),
  copiar: (el) => copiar(el.dataset.v, 'Chave copiada.'),
  'copiar-docs': () => copiar(prods().filter((p) => p.semVinculo).map((p) => p.docFull).join('\n'), 'Documentos copiados.'),
  mais: () => { S.notas.mostrar += 12; render() },
  'limpar-notas': () => { S.notas = { prod: '', tipo: '', cfop: '', comp: '', sit: '', chave: '', lig: false, mostrar: 12, sel: [] }; render() },
  'aba-f': (el) => { S.falhas.aba = el.dataset.k; render() },
  'aba-i': (el) => { S.imp.aba = el.dataset.k; render() },
  tentar: (el) => tentar([el.dataset.id]),
  'tentar-sel': () => tentar([...S.falhas.sel]),
  'tentar-proc': (el) => tentarProc(el.dataset.id),
  novo: () => { S.dlg = 'novo'; S.form = null; render() },
  cmd: (el) => { S.cmd = { srv: el.dataset.srv, tipo: el.dataset.t }; S.form = null; render(); document.getElementById('g-motivo')?.focus() },
  'cmd-cancelar': () => { S.cmd = null; S.form = null; render() },
  redef: () => { S.redef = true; S.form = null; render() },
  'redef-cancelar': () => { S.redef = false; S.form = null; render() },
}
const F = {
  ...X.F,
  'busca-p': (el) => { S.painel.busca = el.value; S.painel.pag = 1; render() },
  'busca-q': (el) => { S.prods.busca = el.value; S.prods.pag = 1; render() },
  'n-prod': (el) => { S.notas.prod = el.value; S.notas.mostrar = 12; render() },
  'n-cfop': (el) => { S.notas.cfop = el.value; S.notas.mostrar = 12; render() },
  'n-sel': (el) => { const s = S.notas.sel; el.checked ? s.push(el.dataset.v) : s.splice(s.indexOf(el.dataset.v), 1); render() },
  'n-sel-todas': (el) => { S.notas.sel = el.checked ? notasFiltradas().map(idNota) : []; render() },
  'n-tipo': (el) => { S.notas.tipo = el.value; S.notas.mostrar = 12; render() },
  'n-comp': (el) => { S.notas.comp = el.value.trim(); S.notas.mostrar = 12; render() },
  'n-sit': (el) => { S.notas.sit = el.value; S.notas.mostrar = 12; render() },
  'n-chave': (el) => { S.notas.chave = el.value; S.notas.mostrar = 12; render() },
  'i-prod': (el) => { S.imp.prod = el.value; render() },
  'i-so': (el) => { S.imp.soProblema = el.checked; render() },
  'f-sel': (el) => { el.checked ? S.falhas.sel.add(+el.value) : S.falhas.sel.delete(+el.value); render() },
  'f-todos': (el) => { prods().filter((p) => p.semVinculo).forEach((p) => (el.checked ? S.falhas.sel.add(p.id) : S.falhas.sel.delete(p.id))); render() },
}
const SUB = {
  ...X.SUB,
  cmd(form) {
    const p = prod(rota().q.get('produtor')), motivo = form.motivo.value.trim()
    if (!motivo) { S.form = { motivo, erro: 'Informe o motivo.' }; render(); document.getElementById('g-motivo')?.focus(); return }
    executar(p, p.cursores.find((c) => c.servico === S.cmd.srv), S.cmd.tipo, motivo)
    S.cmd = null; S.form = null; render()
  },
  redef(form) {
    const p = prod(rota().q.get('produtor')), v = Object.fromEntries(new FormData(form))
    const erro = !/^\d+$/.test(v.nsu.trim()) ? 'Informe o NSU como número.' : v.doc.trim() !== p.docMasc ? 'O documento digitado não confere com o mascarado do produtor.' : !v.motivo.trim() ? 'Informe o motivo.' : null
    if (erro) { S.form = { ...v, erro }; render(); return }
    const c = p.cursores.find((x) => x.servico === v.srv), antes = c.nsu
    c.nsu = +v.nsu.trim()
    logCmd(p, c, 'Redefinir NSU', v.motivo.trim(), `Executado · NSU ${antes} → ${c.nsu}`)
    toast(`NSU de ${c.servico} redefinido: ${antes} → ${c.nsu}.`)
    S.redef = false; S.form = null; render()
  },
  novo(form) {
    const l = form.doc.value.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
    const cpf = /^\d{11}$/.test(l), cnpj = /^[0-9A-Z]{12}\d{2}$/.test(l) // o dígito verificador não é conferido no protótipo
    const erro = !cpf && !cnpj ? 'Documento inválido: informe 11 dígitos (CPF) ou 14 posições alfanuméricas (CNPJ).' : D.produtores.some((p) => p.docFull.replace(/[^0-9A-Z]/g, '') === l) ? 'Documento já cadastrado.' : null
    if (erro) { S.form = { doc: form.doc.value, erro }; render(); document.getElementById('d-doc')?.focus(); return }
    const id = Math.max(...D.produtores.map((p) => p.id), 0) + 1
    const docFull = cpf ? `${l.slice(0, 3)}.${l.slice(3, 6)}.${l.slice(6, 9)}-${l.slice(9)}` : `${l.slice(0, 2)}.${l.slice(2, 5)}.${l.slice(5, 8)}/${l.slice(8, 12)}-${l.slice(12)}`
    const docMasc = cpf ? `***.${l.slice(3, 6)}.${l.slice(6, 9)}-**` : `**.${l.slice(2, 5)}.${l.slice(5, 8)}/${l.slice(8, 12)}-**`
    const p = { id, nome: 'Aguardando primeira nota', docMasc, docFull, municipio: null, semVinculo: false, syncAntigo: false, cadastro: '19/11/2026', cont: { nfe: 0, nfce: 0, cte: 0, ev: 0, nfse: 0 }, semProcuracao: false, ultima: null,
      cursores: SERV.map((servico) => ({ servico, nsu: 0, proxima: '14:35', cstat: null, sync: null, pausado: null, exec: false })) }
    D.produtores.push(p)
    D.comandos.unshift({ quando: `19/11 ${AGORA}`, cmd: 'Cadastrar produtor', prod: p.nome, serv: '—', motivo: 'cadastro pelo documento', origem: 'token', res: 'Executado' })
    S.dlg = null; S.form = null; toast('Produtor cadastrado. A primeira consulta roda em instantes.'); render()
    setTimeout(() => { sefsc(p).forEach((c) => { c.cstat = SIM.vincOk ? 117 : 8002 }); p.semVinculo = !SIM.vincOk; p.semProcuracao = !SIM.procOk; p.cursores[3].cstat = SIM.procOk ? 'E2220' : 'E2245'; p.cursores.forEach((c) => logTent(p, c, c.cstat)); toast(SIM.vincOk && SIM.procOk ? 'Primeira consulta: sem notas ainda (117 e E2220).' : 'Primeira consulta: faltam vínculo (8002) e/ou procuração (E2245). Veja em Falhas.'); render() }, 2500)
  },
}

const app = document.getElementById('app')
app.addEventListener('click', (e) => { const el = e.target.closest('[data-a]'); if (el && !el.disabled) AC[el.dataset.a]?.(el, e) })
app.addEventListener('input', (e) => { const el = e.target.closest('[data-f]'); if (el && el.type !== 'checkbox' && el.tagName !== 'SELECT') F[el.dataset.f]?.(el) })
app.addEventListener('change', (e) => { const el = e.target.closest('[data-f]'); if (el && (el.type === 'checkbox' || el.tagName === 'SELECT')) F[el.dataset.f]?.(el) })
app.addEventListener('submit', (e) => { e.preventDefault(); SUB[e.target.dataset.s]?.(e.target) })
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (S.dlg || rota().q.get('produtor'))) fechar() })
window.addEventListener('hashchange', render)

document.getElementById('cenario').addEventListener('change', (e) => {
  SIM.cenario = e.target.value
  if (SIM.cenario === 'carregando') {
    S.carregando = true
    setTimeout(() => { S.carregando = false; SIM.cenario = 'normal'; e.target.value = 'normal'; render() }, 1500)
  }
  render()
})
document.getElementById('vincok').addEventListener('change', (e) => { SIM.vincOk = e.target.checked })
document.getElementById('procok').addEventListener('change', (e) => { SIM.procOk = e.target.checked })
document.getElementById('cert-sim').addEventListener('change', (e) => { SIM.cert = e.target.value; render() })
document.getElementById('rej593').addEventListener('change', (e) => { SIM.rej593 = e.target.checked })
document.getElementById('reiniciar').addEventListener('click', () => { D = criar(); X.reiniciar(); S.falhas.sel.clear(); S.cmd = null; S.redef = false; render(); toast('Dados reiniciados.') })

aplicarTema()
render()
