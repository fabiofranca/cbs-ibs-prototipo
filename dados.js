// Dados 100% fictícios (gerador com semente fixa). Nada aqui vem do banco, de produtor ou de nota reais.
export const AGORA = '14:31'
export const CERT = { venceEm: '21/07/2027', dias: 244 }
export const XMOTIVO = {
  118: 'Documento(s) localizado(s)',
  200: 'Documento(s) localizado(s) (ADN)',
  E2220: 'Nenhum documento localizado (ADN)',
  E2245: 'Não há procuração do produtor para o certificado do contador (ADN)',
  117: 'Nenhum documento localizado',
  657: 'Rejeição: consumo indevido',
  8002: 'Requisitante não é contabilista do CPF/CNPJ informado',
}
export const EV_DESC = { 110111: 'Cancelamento', 110110: 'Carta de correção' }
// Tipos de operação lidos do CFOP (ver docs/classificacao-cfop.md). Os CFOPs são exemplos reais da tabela do Confaz; as notas são fictícias.
export const CFOP_EXEMPLOS = {
  Receita: ['5101', '5102', '6102'], Despesa: ['1102', '2102', '1556'], 'Remessa e retorno': ['5901', '5915', '5905'],
  Transferência: ['5152', '5151', '1152'], 'Venda de imobilizado': ['5551', '6551', '7551'], 'Compra de imobilizado': ['1551', '2551', '1551'],
  Devolução: ['1202', '5202', '1201'], 'Bonificação e doação': ['5910', '5911', '1910'], Outros: ['5949', '5929', '1949'],
}
export const CATEGORIAS_CFOP = Object.keys(CFOP_EXEMPLOS)
export const fmtChave = (c) => c.replace(/(.{4})(?=.)/g, '$1 ')
export const fmtNum = (n) => n.toLocaleString('pt-BR')

const pad = (n, l) => String(n).padStart(l, '0')
const fmtData = (t) => `${pad(t.getDate(), 2)}/${pad(t.getMonth() + 1, 2)} ${pad(t.getHours(), 2)}:${pad(t.getMinutes(), 2)}`
const MUNICIPIOS = ['São Joaquim', 'Urubici', 'Bom Jardim da Serra', 'Lages']
const PROX = ['14:50', '15:05', '15:20', '15:35']

function rng(seed) {
  let s = seed >>> 0
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296
}

export function criar() {
  const r = rng(20261119)
  const int = (a, b) => a + Math.floor(r() * (b - a + 1))
  const dig = (n) => Array.from({ length: n }, () => int(0, 9)).join('')
  const SEM_VINCULO = [3, 5, 12], SEM_PROC = [6, 14], NOVO = 7, SYNC_ANTIGO = 9, PAUSA_NFE = 4, PAUSA_CTE = 11
  const produtores = []
  const notas = []

  // mais receita e despesa que o resto, como numa propriedade real
  const PESOS = ['Receita', 'Receita', 'Receita', 'Despesa', 'Despesa', 'Despesa', ...CATEGORIAS_CFOP.slice(2)]
  const gerar = (p, tipo, modelo, qtd) => {
    for (let k = 0; k < qtd; k++) {
      const emissao = ['2026-09', '2026-10', '2026-11'][int(0, 2)]
      const serie = int(1, 3), numero = int(1, 9999)
      // chave: UF 42 + AAMM + 14 do emitente (fictício, começa com 000000) + modelo + série + número + tpEmis + cNF + DV
      const chave = '42' + emissao.slice(2, 4) + emissao.slice(5, 7) + '000000' + dig(8) + modelo + pad(serie, 3) + pad(numero, 9) + '1' + dig(8) + dig(1)
      // CFOP fictício derivado do número (sem sortear, para não mudar o resto dos dados)
      const categoria = tipo === 'CT-e' ? 'Despesa' : PESOS[numero % PESOS.length]
      const cfop = tipo === 'CT-e' ? '1352' : CFOP_EXEMPLOS[categoria][(numero >> 2) % 3]
      const n = { chave, tipo, modelo, serie, numero, emissao, situacao: 'Autorizada', prodId: p.id, k: r() * 0.99, cfop, categoria }
      notas.push(n)
      if (tipo === 'NF-e' && r() < 0.1) {
        n.situacao = 'Cancelada'
        notas.push({ chave, tipo: 'Evento', evento: 110111, modelo, serie, numero, emissao, situacao: 'Autorizada', prodId: p.id, k: n.k + 0.005 })
      }
    }
  }

  for (let i = 1; i <= 16; i++) {
    const cnpj = i % 3 === 1
    const a = dig(3), b = dig(3)
    const semNotas = SEM_VINCULO.includes(i) || i === NOVO
    const p = {
      id: i,
      nome: i === NOVO ? 'Aguardando primeira nota' : `Produtor Exemplo ${String.fromCharCode(64 + i)}`,
      docMasc: cnpj ? `**.${a}.${b}/0001-**` : `***.${a}.${b}-**`,
      docFull: cnpj ? `00.${a}.${b}/0001-00` : `000.${a}.${b}-00`,
      municipio: semNotas ? null : MUNICIPIOS[i % MUNICIPIOS.length],
      semVinculo: SEM_VINCULO.includes(i),
      semProcuracao: SEM_PROC.includes(i),
      syncAntigo: i === SYNC_ANTIGO,
      cadastro: `${pad(4 + (i % 14), 2)}/11/2026`,
      cursores: [],
    }
    gerar(p, 'NF-e', '55', semNotas ? 0 : int(8, 40))
    gerar(p, 'NFC-e', '65', semNotas || i % 2 ? 0 : int(3, 15))
    gerar(p, 'CT-e', '57', semNotas || i % 4 ? 0 : int(1, 5))
    produtores.push(p)
  }

  // NFS-e (ADN): gerador próprio, para não mexer nas notas já existentes. O ADN não tem série nem CFOP; a chave tem 50 dígitos.
  // chave: cLocEmi (7, fictício) + ambiente (1) + tipo de inscrição (1) + inscrição do emitente (14, zeros) + nº da NFS-e (13) + AAMM (4) + código (9) + DV (1)
  const r2 = rng(20261124)
  const int2 = (a, b) => a + Math.floor(r2() * (b - a + 1))
  const dig2 = (n) => Array.from({ length: n }, () => int2(0, 9)).join('')
  produtores.forEach((p) => {
    const semNotas = SEM_VINCULO.includes(p.id) || p.id === NOVO || SEM_PROC.includes(p.id) || p.id % 3 === 0
    const qtd = semNotas ? 0 : int2(2, 9)
    for (let k = 0; k < qtd; k++) {
      const emissao = ['2026-09', '2026-10', '2026-11'][int2(0, 2)]
      const numero = int2(1, 900)
      const chave = '0000000' + '1' + '1' + '0'.repeat(14) + pad(numero, 13) + emissao.slice(2, 4) + emissao.slice(5, 7) + dig2(9) + dig2(1)
      notas.push({ chave, tipo: 'NFS-e', modelo: '—', serie: null, numero, emissao, situacao: 'Autorizada', prodId: p.id, k: r2() * 0.99, papel: int2(0, 4) ? 'Tomador' : 'Prestador' })
    }
  })

  // Ordem de captura: embaralha, mas o evento fica depois da nota; o NSU cresce por produtor e serviço.
  notas.sort((x, y) => x.k - y.k)
  const base = new Date(2026, 10, 19, 14, 20).getTime()
  const cont = {}
  notas.forEach((n, idx) => {
    const srv = n.tipo === 'Evento' ? 'NF-e' : n.tipo
    const key = n.prodId + srv
    n.nsu = cont[key] = (cont[key] || 0) + 1
    n.cap = fmtData(new Date(base - (notas.length - idx) * 9 * 60000))
  })
  notas.reverse() // mais recentes primeiro

  const tentativas = []
  produtores.forEach((p) => {
    const mine = notas.filter((n) => n.prodId === p.id)
    p.cont = {
      nfe: mine.filter((n) => n.tipo === 'NF-e').length,
      nfce: mine.filter((n) => n.tipo === 'NFC-e').length,
      cte: mine.filter((n) => n.tipo === 'CT-e').length,
      ev: mine.filter((n) => n.tipo === 'Evento').length,
      nfse: mine.filter((n) => n.tipo === 'NFS-e').length,
    }
    p.ultima = mine[0]?.cap ?? null
    const nsuDe = { 'NF-e': p.cont.nfe + p.cont.ev, 'NFC-e': p.cont.nfce, 'CT-e': p.cont.cte, 'NFS-e': p.cont.nfse }
    ;['NF-e', 'NFC-e', 'CT-e', 'NFS-e'].forEach((servico, j) => {
      const nsu = nsuDe[servico]
      const c = {
        servico, nsu, proxima: PROX[(p.id + j) % 4],
        // NFS-e fala com o ADN: o vínculo do SAT (8002) não vale; vale a procuração (E2245)
        cstat: servico === 'NFS-e' ? (p.semProcuracao ? 'E2245' : p.id === NOVO ? null : nsu > 0 ? 200 : 'E2220') : p.semVinculo ? 8002 : p.id === NOVO ? null : nsu > 0 ? 118 : 117,
        sync: (servico === 'NFS-e' ? p.semProcuracao : p.semVinculo) || p.id === NOVO || p.syncAntigo ? null : '19/11 02:35',
        pausado: null, exec: false,
      }
      if (p.id === PAUSA_NFE && j === 0) c.pausado = { motivo: 'aguardando vínculo', quando: '17/11 10:02', por: 'token' }
      if (p.id === PAUSA_CTE && j === 2) c.pausado = { motivo: 'produtor não emite CT-e', quando: '12/11 15:20', por: 'token' }
      p.cursores.push(c)
      if (p.id === NOVO) return
      const hora = (servico === 'NFS-e' ? p.semProcuracao : p.semVinculo) ? '09:10' : ['14:20', '14:05', '02:35', '14:12'][j]
      const docs = c.cstat === 118 || c.cstat === 200 ? Math.min(nsu, 50) : 0
      tentativas.push({ hora, prodId: p.id, prod: p.nome, serv: servico, cstat: c.cstat, docs, nsu: docs ? `${nsu - docs} → ${nsu}` : '—' })
    })
  })
  tentativas.sort((x, y) => y.hora.localeCompare(x.hora))

  const comandos = [
    { quando: '17/11 10:02', cmd: 'Pausar', prod: 'Produtor Exemplo D', serv: 'NF-e', motivo: 'aguardando vínculo', origem: 'token', res: 'Executado' },
    { quando: '16/11 16:40', cmd: 'Redefinir NSU', prod: 'Produtor Exemplo B', serv: 'NF-e', motivo: 'recuperar lote perdido', origem: 'token', res: 'Executado · NSU 31 → 18' },
    { quando: '16/11 09:12', cmd: 'Sincronizar agora', prod: 'Produtor Exemplo A', serv: 'CT-e', motivo: 'conferir nota de ontem', origem: 'token', res: 'Executado' },
  ]
  return { produtores, notas, tentativas, comandos }
}
