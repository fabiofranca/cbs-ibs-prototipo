// Módulos 02 a 05 do protótipo: certificados, importação, vínculo CPF→CNPJ e manifestação.
// Tudo simulado em memória, sem rede. Recebe os utilitários do app.js (ctx) para não duplicar código.
export function instalar(ctx) {
  const { html, raw, tabela, chip, S, SIM, d, toast, render, guarda, prods, prod, est, vinculo, fmtNum, fmtChave, AGORA, CERT } = ctx

  const novoEstado = () => ({
    certs: [{ id: 1, nome: 'Contador Exemplo (A1)', serie: '00 00 00 00', titular: '***.000.000-**', tipo: 'A1 (PKCS12)', validade: CERT.venceEm, dias: CERT.dias, ativo: true, cifrado: true, ultimoUso: '19/11/2026 14:20' }],
    cert: null, // diálogo de troca
    arquivos: [
      { quando: '19/11 09:40', prodId: 2, origem: 'XML', arquivo: 'nota-01.xml', novas: 1, dup: 0, erros: 0 },
      { quando: '18/11 16:12', prodId: 3, origem: 'Chave avulsa', arquivo: '1 chave', novas: 0, dup: 0, erros: 1 },
    ],
    imp: { passo: 1, modo: 'sat', prod: '', arq: '', chaves: '', erro: null, prev: null, res: null },
    ligacoes: [[2, 1], [3, 1], [2, 4]], // [id do CPF, id do CNPJ]
    vin: { aba: 'cpf', filtro: 'todos' },
    lig: null,
    manif: null,
    man: { aba: 'pend' },
    mdlg: null,
  })
  let M = novoEstado()

  const hoje = () => `19/11 ${AGORA}`
  const logCmd = (cmd, prodNome, serv, motivo, res) => d().comandos.unshift({ quando: hoje(), cmd, prod: prodNome, serv, motivo, origem: 'token', res })
  const stepper = (nomes, atual) => html`<ol class="passos" aria-label="Passos">${nomes.map((t, i) => html`<li ${raw(atual === i + 1 ? 'class="on" aria-current="step"' : '')}>${i + 1} ${t}</li>`)}</ol>`
  const hipbox = (titulo, corpo) => html`<div class="hipbox" role="note"><b>HIPÓTESE · ${titulo}</b> ${corpo}</div>`
  const lista = (itens) => html`<ul class="lista">${itens.map((i) => html`<li>${i}</li>`)}</ul>`
  const isCnpj = (p) => p.docMasc.startsWith('**.')
  const pad = (n, l) => String(n).padStart(l, '0')

  // ================= 02 Certificados (T8) =================
  const efetivo = (c) => (c.ativo ? { ...c, dias: { vencendo: 29, vencido: -1 }[SIM.cert] ?? c.dias, cifrado: SIM.cert === 'semcofre' ? false : c.cifrado } : c)
  const certList = () => (SIM.cert === 'sem' ? [] : M.certs.map(efetivo))
  const certAtivo = () => certList().find((c) => c.ativo) || null
  const sitCert = (c) => (!c.ativo ? { sim: '‖', cls: 'neutro', txt: 'Inativo' } : c.dias < 0 ? { sim: '✕', cls: 'erro', txt: 'Vencido' } : c.dias < 30 ? { sim: '▲', cls: 'aviso', txt: 'Vencendo' } : { sim: '○', cls: 'ok', txt: 'Válido' })
  const certTopo = () => { const c = certAtivo(); return !c ? 'Sem certificado ativo' : c.dias < 0 ? 'Certificado vencido' : `Certificado vence em ${c.dias} dias (${c.validade})` }
  function certAlertas() {
    const c = certAtivo()
    if (!c) return [{ k: 'crit', sim: '✕', selo: 'Problema: sem certificado', txt: 'Nenhum certificado ativo. Sem certificado a SEF-SC não responde e nenhum produtor é capturado.', link: ['#/certificados', 'Adicionar certificado'] }]
    if (c.dias < 0) return [{ k: 'crit', sim: '✕', selo: 'Problema: certificado vencido', txt: `Certificado vencido em ${c.validade}. Nada está sendo capturado de nenhum produtor.`, link: ['#/certificados', 'Trocar certificado'] }]
    if (c.dias < 30) return [{ k: 'aviso', sim: '▲', txt: `O certificado vence em ${c.dias} dias (${c.validade}). Se vencer, toda a captura para.`, link: ['#/certificados', 'Trocar certificado'] }]
    return []
  }

  const vCert = guarda(() => {
    const cs = certList(), a = cs.find((c) => c.ativo)
    const simulado = ['vencendo', 'vencido'].includes(SIM.cert)
    const aviso = a && a.dias < 0
      ? html`<div class="caixa-erro" role="alert">✕ O certificado ${a.nome} venceu em ${a.validade}. <b>Nada está sendo capturado</b> de nenhum produtor. <button type="button" class="p" data-a="cert-abrir">Trocar certificado</button></div>`
      : a && a.dias < 30 ? html`<div class="caixa-erro" role="status" style="background:var(--aviso-bg);color:var(--aviso);border-color:var(--aviso)">▲ O certificado ${a.nome} vence em <b>${a.validade}</b>, daqui a ${a.dias} dias. Se vencer, <b>toda a captura para</b> (NF-e, NFC-e e CT-e de todos os produtores). <button type="button" class="p" data-a="cert-abrir">Trocar certificado</button></div>` : ''
    return html`<h2 class="sr">Certificados</h2>
    ${aviso}${simulado ? html`<p class="suave">Cenário simulado: a data de validade é a mesma e só os dias restantes mudam (hoje faltam ${CERT.dias}).</p>` : ''}
    <div class="barra"><b>${cs.length} certificado${cs.length === 1 ? '' : 's'}</b><span class="suave">· o sistema usa um A1 ativo por vez</span><span class="ml"></span><button type="button" class="p" data-a="cert-abrir">${a ? '+ Trocar certificado' : '+ Adicionar certificado'}</button></div>
    ${tabela(html`<th>Certificado</th><th>Titular (mascarado)</th><th>Tipo</th><th>Validade</th><th>Situação</th><th class="num">Produtores</th><th>Guardado</th>`,
      cs.map((c) => { const s = sitCert(c); return html`<tr><td>${c.nome}<small class="mono">série ${c.serie}</small></td><td class="mono">${c.titular}</td><td>${c.tipo}</td><td>até ${c.validade}<small>${c.ativo ? `faltam ${c.dias} dias` : 'guardado como inativo'}</small></td>
        <td><span class="st ${s.cls}">${s.sim} ${s.txt}</span><small>${c.ativo ? 'ativo · em uso' : 'fora de uso'}</small></td><td class="num">${c.ativo ? prods().length : 0}</td><td>Cifrado em repouso: <b>${c.cifrado ? 'sim' : 'não'}</b></td></tr>` }),
      'Certificados', html`Nenhum certificado cadastrado.<br>Sem certificado a SEF-SC não responde.<br><small>Cadastrar um produtor também falha: "nenhum certificado ativo".</small><br><button type="button" class="p" data-a="cert-abrir">+ Adicionar certificado</button>`)}
    ${a && !a.cifrado ? html`<div class="caixa-erro" style="background:var(--aviso-bg);color:var(--aviso);border-color:var(--aviso)">▲ Cifrado em repouso: <b>não</b>. Este certificado está em arquivo comum. Não use em produção. <small>Em produção o cofre cifrado é pré-requisito (decisão de 2026-11-09).</small></div>` : ''}
    ${a ? html`<div class="sec"><h3>Detalhe do certificado ativo</h3></div><div class="dois">
      <section class="cartao" aria-label="Identificação"><h3>Identificação</h3><dl class="kv"><dt>Titular</dt><dd>${a.nome.replace(' (A1)', '')}</dd><dt>Documento</dt><dd class="mono">${a.titular}</dd><dt>Emissor</dt><dd>AC ICP-Brasil (fictícia)</dd><dt>Válido até</dt><dd>${a.validade} 23:59</dd></dl></section>
      <section class="cartao" aria-label="Uso na captura"><h3>Uso na captura</h3><dl class="kv"><dt>Produtores</dt><dd>${prods().length} (todos usam este)</dd><dt>Último uso</dt><dd>${a.ultimoUso}</dd><dt>Última resposta</dt><dd class="mono">118</dd><dt>Bloqueio (657)</dt><dd>${SIM.cenario === 'bloqueio' ? 'NFC-e até 15:40 (vale para o certificado inteiro)' : 'nenhum'}</dd></dl></section></div>
      <p class="cartao" style="margin-top:10px">Senha do certificado: <b>nunca é mostrada</b>, nem mascarada com valor. Só consta "senha cadastrada: sim".</p>` : ''}`
  })

  const ARQ_CERT = { '': 'Escolher arquivo…', 'contador-2028.pfx': 'contador-2028.pfx (mesmo titular)', 'contador-2028-outro-titular.pfx': 'contador-2028-outro-titular.pfx (outro titular)', 'arquivo.txt': 'arquivo.txt (formato inválido)' }
  function dlgCert() {
    const c = M.cert
    const pass = ['Arquivo e senha', 'Conferir', 'Ativar', 'Acompanhar']
    let corpo
    if (c.passo === 1) {
      corpo = html`<form class="form" data-s="cert1" style="flex-direction:column;align-items:stretch">
        <label>Arquivo do certificado (.pfx ou .p12) · simulado<select name="arq" id="c-arq">${Object.entries(ARQ_CERT).map(([k, v]) => html`<option value="${k}" ${raw(c.arq === k ? 'selected' : '')}>${v}</option>`)}</select></label>
        <label>Senha do certificado<input type="password" name="senha" id="c-senha" autocomplete="off" ${raw(c.erro ? 'aria-invalid="true"' : '')}></label>
        <p class="suave">A senha não vai para URL, log nem tela, e <b>não é guardada</b> neste protótipo. A senha "errada" simula senha incorreta; qualquer outra vale. O certificado novo entra <b>inativo</b>: a captura continua com o atual até você ativar.</p>
        ${c.erro ? html`<p class="msg-erro" role="alert">${c.erro}</p>` : ''}
        <div class="form"><button type="submit" class="p">Conferir certificado</button><button type="button" data-a="fechar">Cancelar</button></div></form>`
    } else if (c.passo === 2) {
      corpo = html`<dl class="kv"><dt>Titular</dt><dd>${c.outro ? '▲ Outro Titular Exemplo (diferente do atual)' : 'Contador Exemplo ✓ mesmo titular'}</dd><dt>Documento</dt><dd class="mono">${c.outro ? '***.111.111-**' : '***.000.000-**'}</dd><dt>Válido até</dt><dd>20/07/2028 ✓</dd><dt>Cadeia</dt><dd>ICP-Brasil ✓</dd><dt>Senha</dt><dd>aceita ✓</dd></dl>
        <div class="caixa-erro" style="background:var(--aviso-bg);color:var(--aviso);border-color:var(--aviso);font-weight:400">${c.outro ? html`<b>Atenção:</b> o titular é outro. O vínculo dos ${prods().length} produtores na SEF-SC está ligado ao <b>titular</b>: eles voltam a dar 8002 até você refazer os vínculos no SAT.` : html`O vínculo dos produtores na SEF-SC está ligado ao <b>titular</b> do certificado. Titular igual: os vínculos continuam valendo.`}</div>
        <div class="form"><button type="button" class="p" data-a="cert-prox">Continuar</button><button type="button" data-a="cert-volt">Voltar</button></div>`
    } else if (c.passo === 3) {
      corpo = html`<div class="risco-box"><b>Trocar o certificado ativo.</b> A partir de agora todas as consultas usam o novo. O antigo fica guardado como inativo até ${CERT.venceEm}, para voltar atrás.</div>
        <form class="form" data-s="cert3"><label>Motivo (obrigatório)<input name="motivo" id="c-motivo" size="30" ${raw(c.erro ? 'aria-invalid="true"' : '')}></label>
        <button type="submit" class="risco">Ativar certificado novo</button><button type="button" data-a="cert-volt">Voltar</button>${c.erro ? html`<span class="msg-erro" role="alert">${c.erro}</span>` : ''}</form>
        <small>Fica no histórico de comandos: quando, motivo, origem.</small>`
    } else {
      const lin = (srv) => { const s = c.acomp?.[srv]; return html`<tr><td>${srv}</td><td>${s === 'ok' ? '○ Última consulta ' + AGORA + ' · cStat 118' : s === 'bloq' ? '■ Bloqueio até 15:40 (vale para o certificado)' : s === 'vinc' ? (srv === 'NFS-e' ? '▲ E2245: o titular mudou, refaça as procurações no ADN' : '▲ 8002: o titular mudou, refaça os vínculos no SAT') : '◐ Consultando…'}</td><td>${s === 'ok' ? '✓ Voltou' : s === 'bloq' ? 'aguardando' : s === 'vinc' ? '✕ Sem vínculo' : '…'}</td></tr>` }
      corpo = html`<b>Conferindo a captura com o novo certificado</b>
        <div class="rolagem" style="max-height:none"><table><caption class="sr">Acompanhamento por serviço</caption><tbody>${['NF-e', 'NFC-e', 'CT-e', 'NFS-e'].map(lin)}</tbody></table></div>
        <div class="form"><button type="button" class="p" data-a="fechar">Concluir</button><button type="button" class="risco" data-a="cert-reverter">Voltar ao certificado anterior</button></div>`
    }
    return html`<div class="cortina" data-a="fechar"></div>
    <div class="dlg" role="dialog" aria-modal="true" aria-labelledby="d-tit" tabindex="-1" id="dlg" style="width:min(640px,94%)">
      <h2 id="d-tit">${certAtivo() ? 'Trocar certificado' : 'Adicionar certificado'}</h2>${stepper(pass, c.passo)}${corpo}</div>`
  }
  function acompanhar() {
    const c = M.cert
    c.acomp = {}
    const fim = (srv, ms) => setTimeout(() => {
      if (M.cert !== c) return
      c.acomp[srv] = c.outro ? 'vinc' : srv === 'NFC-e' && SIM.cenario === 'bloqueio' ? 'bloq' : 'ok'
      if (S.dlg === 'cert') render()
    }, ms)
    fim('NF-e', 1200); fim('NFC-e', 1900); fim('CT-e', 2600); fim('NFS-e', 3200)
  }

  // ================= 03 Importação (T9 e T10) =================
  const ARQS = {
    'exportacao-sat-exemplo.zip': { itens: 212, novas: 180, dup: 30, erros: ['linha 14: chave com 43 posições', 'linha 77: emitente de outro documento'] },
    'nota-01.xml': { itens: 1, novas: 1, dup: 0, erros: [] },
    'nota-outro-documento.xml': { itens: 1, novas: 0, dup: 0, erros: ['emitente de outro documento'] },
    'arquivo-invalido.txt': { invalido: 'formato não reconhecido. Aceitos: .zip, .xml e o arquivo exportado do SAT.' },
    'arquivo-grande.zip': { invalido: 'o arquivo passa do limite de tamanho. Divida por período e envie de novo.' },
  }
  const ORIGEM = { sat: 'Exportação do SAT', xml: 'XML ou ZIP', chave: 'Chave avulsa' }
  const JANELA = ['2609', '2610', '2611'] // mês atual (11/2026) e dois anteriores

  function previa() {
    const I = M.imp
    if (I.modo === 'chave') {
      const chaves = I.chaves.split(/\r?\n/).map((l) => l.replace(/\s/g, '').toUpperCase()).filter(Boolean)
      const novas = [], dup = [], erros = []
      chaves.forEach((k) => {
        if (!/^[0-9A-Z]{44}$/.test(k)) erros.push(`${k.slice(0, 12)}…: chave com ${k.length} posições (são 44, alfanuméricas)`)
        else if (d().notas.some((n) => n.chave === k) || novas.includes(k)) dup.push(k)
        else if (!JANELA.includes(k.slice(2, 6))) erros.push(`${k.slice(0, 12)}…: anterior aos últimos 3 meses; a SEF-SC pode não entregar. Use a exportação do SAT`)
        else novas.push(k)
      })
      return { itens: chaves.length, novas: novas.length, dup: dup.length, erros, chavesNovas: novas }
    }
    const a = ARQS[I.arq]
    return { itens: a.itens, novas: a.novas, dup: a.dup, erros: a.erros, chavesNovas: [] }
  }
  let seq = 1
  const notaImportada = (p, chave) => {
    const modelo = chave.slice(20, 22), tipo = modelo === '65' ? 'NFC-e' : modelo === '57' ? 'CT-e' : 'NF-e'
    return { chave, tipo, modelo, serie: +chave.slice(22, 25), numero: +chave.slice(25, 34), emissao: `20${chave.slice(2, 4)}-${chave.slice(4, 6)}`, situacao: 'Autorizada', prodId: p.id, nsu: null, cap: hoje(), origem: 'Importação' }
  }
  function chaveFicticia() { const n = seq++; return '42' + '2605' + '000000' + pad(n, 8) + '55' + '001' + pad(n, 9) + '1' + pad(n, 8) + '0' }

  const vImportar = guarda(() => {
    const I = M.imp
    const modos = [['sat', 'Exportação do SAT', 'Arquivo gerado por "Exportar" ou "Exportar itens" na tela de consulta do SAT. Formato ainda não visto (pendência 3.1).'], ['xml', 'XML ou ZIP de XMLs', 'Um ou vários XML de nota, soltos ou num ZIP. Plano B da spec §3.1 (Q2).'], ['chave', 'Chave de acesso', 'Colar uma ou várias chaves (44 caracteres) para buscar na SEF-SC. Consulta por chave não está implementada.']]
    let corpo
    if (I.passo === 1) {
      corpo = html`<form class="form" data-s="imp1" style="flex-direction:column;align-items:stretch;max-width:760px">
        <fieldset class="cartao" style="margin:0"><legend>Como importar</legend>${modos.map(([k, t, ds]) => html`<label class="chk" style="margin:6px 0;align-items:flex-start"><input type="radio" name="modo" value="${k}" data-f="m-modo" ${raw(I.modo === k ? 'checked' : '')}><span><b style="color:var(--texto)">${t}</b> <span class="chip aviso">hipótese</span><small>${ds}</small></span></label>`)}</fieldset>
        <label>Produtor (obrigatório)<select name="prod" data-f="m-prod"><option value="">Escolher…</option>${prods().map((p) => html`<option value="${p.id}" ${raw(+I.prod === p.id ? 'selected' : '')}>${p.nome}</option>`)}</select></label>
        ${I.modo === 'chave'
          ? html`<label>Chaves de acesso (uma por linha, com ou sem espaços)<textarea name="chaves" rows="4" class="mono" data-f="m-chaves" placeholder="44 caracteres por chave">${I.chaves}</textarea></label>`
          : html`<label>Arquivo (simulado)<select name="arq" data-f="m-arq"><option value="">Escolher arquivo…</option>${Object.keys(ARQS).map((k) => html`<option value="${k}" ${raw(I.arq === k ? 'selected' : '')}>${k}</option>`)}</select></label>`}
        <p class="suave">O arquivo é atribuído a um produtor: nota de outro documento vira "com erro". Nada é gravado antes da confirmação. Neste protótipo nenhum arquivo é lido nem enviado.</p>
        ${I.erro ? html`<div class="caixa-erro" role="alert">✕ ${I.erro}</div>` : ''}
        <div class="form"><button type="submit" class="p">Continuar</button></div></form>`
    } else if (I.passo === 2) {
      const v = I.prev
      corpo = html`<div class="barra"><b>${I.modo === 'chave' ? `${v.itens} chave(s)` : I.arq}</b><span class="suave">· ${v.itens} itens lidos · produtor: ${prod(I.prod).nome}</span></div>
        ${tabela(html`<th>Resultado</th><th class="num">Itens</th><th>O que acontece</th>`, [html`<tr><td>○ Novas</td><td class="num">${v.novas}</td><td>serão gravadas</td></tr>`, html`<tr><td>‖ Duplicadas</td><td class="num">${v.dup}</td><td>já existem (mesma chave): ignoradas</td></tr>`, html`<tr><td>✕ Com erro</td><td class="num">${v.erros.length}</td><td>${v.erros.length ? lista(v.erros) : '—'}</td></tr>`], 'Pré-visualização da importação', '')}
        <div class="form"><button type="button" class="p" data-a="imp-confirmar" ${raw(v.novas ? '' : 'disabled')}>Importar ${v.novas} nota${v.novas === 1 ? '' : 's'}</button><button type="button" data-a="imp-voltar">Voltar</button><button type="button" data-a="imp-novo">Cancelar</button></div>
        <small>Nada é salvo antes da confirmação.</small>`
    } else {
      const r = I.res
      corpo = html`<div class="cartao" role="status">${r.erros ? '▲' : '○'} Importação concluída em ${r.quando}: <b>${r.novas} novas</b>, ${r.dup} duplicadas, ${r.erros} com erro.</div>
        <div class="form"><a href="#/notas">Ver notas importadas →</a><button type="button" data-a="imp-novo">Importar outro arquivo</button><a href="#/importacoes" data-a="aba-arq">Histórico de arquivos →</a></div>
        <small>As notas importadas ficam marcadas com a origem "importação" (sem NSU), separadas da captura.</small>`
    }
    return html`<h2 class="sr">Importar notas</h2>
    ${hipbox('Importação', 'Depende da resposta do contador (Q2 e pendências 3.1 a 3.3) e está fora de qualquer estimativa. Serve só para validar a ideia.')}
    <div class="barra"><h2>Importar notas</h2><a href="#/importacoes">← Importações</a></div>${stepper(['Escolher', 'Pré-visualizar', 'Resultado'], I.passo)}${corpo}`
  })
  const vArquivos = () => html`${tabela(html`<th>Quando</th><th>Produtor</th><th>Origem</th><th>Arquivo</th><th class="num">Novas</th><th class="num">Duplic.</th><th class="num">Erros</th><th>Resultado</th>`,
    M.arquivos.map((a) => html`<tr><td>${a.quando}</td><td>${prod(a.prodId)?.nome ?? '—'}</td><td>${a.origem}</td><td class="mono">${a.arquivo}</td><td class="num">${a.novas}</td><td class="num">${a.dup}</td><td class="num">${a.erros}</td><td>${a.erros ? (a.novas ? '▲ Com erros' : '✕ Não importada') : '○ Ok'}</td></tr>`), 'Arquivos importados', 'Nenhum arquivo importado ainda.')}
    <p class="suave">Origem não diz <b>quem</b> importou (sem login): mesma decisão em aberto de Comandos. <span class="chip aviso">hipótese</span></p>`

  // ================= 04 Vínculo CPF→CNPJ (T7) =================
  const cnpjsDe = (cpf) => M.ligacoes.filter(([a]) => a === cpf).map(([, b]) => prod(b)).filter(Boolean)
  const cpfsDe = (cnpj) => M.ligacoes.filter(([, b]) => b === cnpj).map(([a]) => prod(a)).filter(Boolean)
  const ligados = (id) => { const p = prod(id); return p ? (isCnpj(p) ? cpfsDe(id) : cnpjsDe(id)).map((x) => x.id) : [] }
  const captura = (p) => { const e = est(p, p.cursores[0]); return `${e.sim} ${e.txt}` }
  const btnDes = (cpf, cnpj) => html`<button type="button" data-a="desligar" data-cpf="${cpf.id}" data-cnpj="${cnpj.id}" aria-label="Desligar ${cpf.nome} de ${cnpj.nome}">Desligar</button>`
  const abrirProd = (p) => html`<button type="button" class="lnk" data-a="abrir" data-id="${p.id}">${p.nome}</button><small class="mono">${p.docMasc}</small>`

  const vVinculos = guarda(() => {
    const V = M.vin
    const cpfs = prods().filter((p) => !isCnpj(p)), cnpjs = prods().filter(isCnpj)
    const cab = html`${hipbox('Vínculo CPF→CNPJ', 'Depende das respostas 4.1 a 4.3 do contador. A ligação é de muitos para muitos: um CNPJ pode ter vários CPFs e um CPF pode estar em vários CNPJs. Cada documento mantém o próprio cadastro e cursor; a ligação é um par CPF↔CNPJ e não migra NSU nem notas.')}
      <div class="barra"><h2>Transição CPF→CNPJ</h2>${chip('Por CPF', V.aba === 'cpf', 'vin-aba', 'data-k="cpf"')}${chip('Por CNPJ', V.aba === 'cnpj', 'vin-aba', 'data-k="cnpj"')}
      ${V.aba === 'cpf' ? html`${chip(`Todos ${cpfs.length}`, V.filtro === 'todos', 'vin-filtro', 'data-k="todos"')}${chip(`Ligados ${cpfs.filter((p) => cnpjsDe(p.id).length).length}`, V.filtro === 'ligados', 'vin-filtro', 'data-k="ligados"')}${chip(`Sem CNPJ ${cpfs.filter((p) => !cnpjsDe(p.id).length).length}`, V.filtro === 'sem', 'vin-filtro', 'data-k="sem"')}` : ''}
      <span class="ml"></span><button type="button" class="p" data-a="ligar">+ Ligar CPFs e CNPJ</button></div>`
    let tab
    if (V.aba === 'cpf') {
      const l = cpfs.filter((p) => V.filtro === 'todos' || (V.filtro === 'ligados') === (cnpjsDe(p.id).length > 0))
      tab = tabela(html`<th>CPF (antigo)</th><th>CNPJs ligados</th><th>Vínculo de cada CNPJ</th><th>Captura de cada CNPJ</th><th></th>`, l.map((p) => { const cs = cnpjsDe(p.id); return html`<tr><td>${abrirProd(p)}${cs.length > 1 ? html`<small>sócio em ${cs.length} CNPJs</small>` : ''}</td>
        <td>${cs.length ? lista(cs.map((c) => html`${c.nome} <span class="mono">${c.docMasc}</span> ${btnDes(p, c)}`)) : '▲ Nenhum CNPJ ligado'}</td>
        <td>${cs.length ? lista(cs.map((c) => vinculo(c))) : '—'}</td><td>${cs.length ? lista(cs.map(captura)) : '—'}</td>
        <td><button type="button" data-a="ligar" data-cpf="${p.id}">${cs.length ? '+ Ligar a outro CNPJ' : 'Ligar a um CNPJ'}</button></td></tr>` }), 'Transição por CPF', 'Nenhum CPF para esse filtro.')
    } else {
      tab = tabela(html`<th>CNPJ (novo)</th><th>CPFs ligados</th><th>Vínculo</th><th>Situação</th><th></th>`, cnpjs.map((c) => { const ps = cpfsDe(c.id); return html`<tr><td>${abrirProd(c)}</td>
        <td>${ps.length ? lista(ps.map((p) => html`${p.nome} <span class="mono">${p.docMasc}</span> ${btnDes(p, c)}`)) : '▲ Nenhum CPF ligado'}</td><td>${vinculo(c)}</td>
        <td>${ps.length ? `○ Ligado a ${ps.length} CPF${ps.length > 1 ? 's' : ''}` : '▲ Sem CPF'}</td><td><button type="button" data-a="ligar" data-cnpj="${c.id}">+ Ligar CPFs</button></td></tr>` }), 'Transição por CNPJ', 'Nenhum CNPJ cadastrado.')
    }
    return html`<h2 class="sr">Transição CPF→CNPJ</h2>${cab}${tab}
      <p class="suave">O CNPJ é outro cursor com NSU zerado e o vínculo dele no SAT é cadastro seu, fora do sistema. O sistema não decide a qual propriedade pertence uma nota de CPF ligado a vários CNPJs (a IE vem no XML; fora do MVP).</p>`
  })
  const chipLig = (p) => { const n = ligados(p.id).length; return n ? html`<a href="#/vinculos">${isCnpj(p) ? `${n} CPF${n > 1 ? 's' : ''} ligado${n > 1 ? 's' : ''}` : `ligado a ${n} CNPJ${n > 1 ? 's' : ''}`} →</a>` : '' }
  const paresNovos = () => { const L = M.lig; return [...L.cpfs].filter((c) => L.cnpj && !M.ligacoes.some(([a, b]) => a === c && b === +L.cnpj)) }
  function dlgLigar() {
    const L = M.lig
    const cpfs = prods().filter((p) => !isCnpj(p)), cnpjs = prods().filter(isCnpj)
    const n = paresNovos().length
    return html`<div class="cortina" data-a="fechar"></div>
    <form class="dlg" role="dialog" aria-modal="true" aria-labelledby="d-tit" tabindex="-1" id="dlg" data-s="ligar" style="width:min(680px,94%)">
      <h2 id="d-tit">Ligar CPFs e CNPJ</h2>
      <label style="margin-top:8px">CNPJ (novo)<select name="cnpj" id="l-cnpj" data-f="l-cnpj"><option value="">Escolher…</option>${cnpjs.map((c) => html`<option value="${c.id}" ${raw(+L.cnpj === c.id ? 'selected' : '')}>${c.nome} · ${c.docFull}</option>`)}</select></label>
      <div class="rolagem" style="max-height:30vh;margin:8px 0"><table><caption class="sr">CPFs que podem ser ligados</caption><thead><tr><th>Ligar</th><th>CPF</th><th class="num">Notas</th><th>Já ligado a</th></tr></thead><tbody>${cpfs.map((p) => html`<tr><td><input type="checkbox" id="l-cpf-${p.id}" data-f="l-cpf" value="${p.id}" aria-label="Ligar ${p.nome}" ${raw(L.cpfs.has(p.id) ? 'checked' : '')}></td><td>${p.nome}<small class="mono">${p.docFull}</small></td><td class="num">${fmtNum(p.cont.nfe + p.cont.nfce + p.cont.cte + p.cont.ev)}</td><td>${cnpjsDe(p.id).length ? `${cnpjsDe(p.id).length} CNPJ${cnpjsDe(p.id).length > 1 ? 's' : ''}` : 'nenhum'}</td></tr>`)}</tbody></table></div>
      <p class="suave">Um CPF já ligado a outro CNPJ pode ser ligado de novo (sócio de outra propriedade). Serão criadas <b>${n} ligaç${n === 1 ? 'ão' : 'ões'}</b> (CPF↔CNPJ). Os cadastros continuam separados; o NSU do CNPJ começa do zero e <b>nada é baixado de novo</b>. O vínculo do CNPJ no SAT continua sendo cadastro seu, fora do sistema.</p>
      <label>Motivo (obrigatório)<input id="l-motivo" name="motivo" data-f="l-motivo" value="${L.motivo}" size="34" ${raw(L.erro ? 'aria-invalid="true"' : '')}></label>
      ${L.erro ? html`<p class="msg-erro" role="alert">${L.erro}</p>` : ''}
      <div class="form"><button type="submit" class="p">Criar ${n} ligaç${n === 1 ? 'ão' : 'ões'}</button><button type="button" data-a="fechar">Cancelar</button></div></form>`
  }

  // ================= 05 Manifestação (T11) =================
  const TIPOS = { 'NF-e': [['210200', 'Confirmação da Operação', 'a operação aconteceu como na nota'], ['210210', 'Ciência da Operação', 'só toma ciência; não confirma'], ['210220', 'Desconhecimento da Operação', 'o produtor não reconhece a operação'], ['210240', 'Operação não Realizada', 'reconhece, mas a mercadoria não foi entregue ou foi recusada']], 'NFS-e': [['203202', 'Confirmar', 'o tomador confirma a NFS-e'], ['203206', 'Rejeitar', 'o tomador rejeita a NFS-e']] }
  function manif() {
    if (M.manif) return M.manif
    const vistos = new Set(), lista = []
    d().notas.filter((n) => n.tipo === 'NF-e' && n.situacao === 'Autorizada').forEach((n) => { if (lista.length < 6 && !vistos.has(n.chave)) { vistos.add(n.chave); lista.push(n) } })
    M.manif = lista.map((n, i) => ({ id: i + 1, tipo: 'NF-e', chave: n.chave, numero: String(n.numero), prodId: n.prodId, emissao: n.emissao, prazo: i === 3 ? '12/11/2026' : '18/12/2026', foraPrazo: i === 3, estado: i >= 4 ? 'Confirmação da Operação' : null, quando: i >= 4 ? '03/11 15:20' : null }))
    M.manif.push({ id: 7, tipo: 'NFS-e', chave: 'NFS-e 0000 0000 0000 0001', numero: '1234', prodId: 2, emissao: '2026-11', prazo: '—', estado: null }, { id: 8, tipo: 'NFS-e', chave: 'NFS-e 0000 0000 0000 0002', numero: '1235', prodId: 3, emissao: '2026-11', prazo: '—', estado: 'Confirmar', quando: '10/11 11:02' })
    return M.manif
  }
  const itemDe = (chave) => { const m = manif(); let it = m.find((x) => x.chave === chave); if (!it) { const n = d().notas.find((x) => x.chave === chave && x.tipo === 'NF-e'); if (!n) return null; it = { id: m.length + 1, tipo: 'NF-e', chave, numero: String(n.numero), prodId: n.prodId, emissao: n.emissao, prazo: '18/12/2026', foraPrazo: false, estado: null }; m.push(it) } return it }
  const pendentes = () => manif().filter((x) => !x.estado)

  const vManif = guarda(() => {
    const A = M.man.aba, todos = manif()
    const l = todos.filter((x) => A === 'todas' || (A === 'pend') === !x.estado)
    return html`<h2 class="sr">Manifestação</h2>
    ${hipbox('Manifestação', 'Só se o contador pedir (Q3). Tem efeito fiscal e não se desfaz. Obstáculo: o serviço da SEF-SC que usamos não tem manifestação; a do Ambiente Nacional exige o certificado do próprio interessado (rejeições 593 e 472), e o nosso modelo usa o certificado do contador. Para o tomador de NFS-e, o ADN não prevê o contador agindo em nome do produtor (a confirmar). Pode não ser viável.')}
    <div class="barra"><h2>Manifestação</h2>${chip(`Pendentes ${pendentes().length}`, A === 'pend', 'man-aba', 'data-k="pend"')}${chip(`Manifestadas ${todos.length - pendentes().length}`, A === 'feitas', 'man-aba', 'data-k="feitas"')}${chip(`Todas ${todos.length}`, A === 'todas', 'man-aba', 'data-k="todas"')}</div>
    ${tabela(html`<th>Documento</th><th>Produtor (destinatário ou tomador)</th><th>Emissão</th><th>Prazo</th><th>Situação</th><th></th>`, l.map((x) => html`<tr><td>${x.tipo === 'NF-e' ? html`NF-e <a class="mono" href="#/notas/${x.chave}">${fmtChave(x.chave)}</a><small>só resumo (resNFe)</small>` : html`<span class="mono">${x.chave}</span><small>tomador</small>`}</td>
      <td>${prod(x.prodId)?.nome}</td><td class="mono">${x.emissao}</td><td>${x.foraPrazo ? html`<span class="aviso">▲ ${x.prazo} (passou)</span>` : x.prazo}</td>
      <td>${x.estado ? html`<span class="st ok">○ ${x.estado} em ${x.quando}</span>` : html`<span class="st aviso">▲ Sem manifestação</span>`}</td>
      <td>${x.estado ? html`<button type="button" disabled>Manifestada</button>` : html`<button type="button" class="p" data-a="manifestar" data-chave="${x.chave}" aria-label="Manifestar ${x.tipo} do ${prod(x.prodId)?.nome}">Manifestar…</button>`}</td></tr>`), 'Notas para manifestação', A === 'pend' ? '✓ Nenhuma nota aguardando manifestação.' : 'Nenhuma manifestação registrada.')}
    <p class="suave">Sem ação em lote: manifestar não se desfaz, então um clique por nota, com confirmação.</p>`
  })
  const btnManif = (n) => {
    if (n.tipo !== 'NF-e' || n.modelo !== '55' || n.situacao === 'Cancelada') return ''
    const it = itemDe(n.chave)
    return it.estado ? html`<span class="chip ok">○ ${it.estado} em ${it.quando}</span>` : html`<span class="chip aviso">▲ Sem manifestação</span><button type="button" data-a="manifestar" data-chave="${n.chave}">Manifestar…</button><span class="chip aviso">hipótese</span>`
  }
  function dlgManif() {
    const m = M.mdlg, it = m.item, tipos = TIPOS[it.tipo], t = tipos.find((x) => x[0] === m.tipo)
    let corpo
    if (m.passo === 1) {
      corpo = html`<form class="form" data-s="man1" style="flex-direction:column;align-items:stretch">
        <div class="kv"><b>Nota</b><span class="mono">${it.tipo} ${it.numero}</span><b>Produtor</b><span>${prod(it.prodId)?.nome}</span></div>
        <fieldset class="cartao" style="margin:0"><legend>Manifestação</legend>${tipos.map(([c, n, ds]) => html`<label class="chk" style="margin:5px 0;align-items:flex-start"><input type="radio" name="tipo" value="${c}" ${raw(m.tipo === c ? 'checked' : '')}><span><b style="color:var(--texto)">${n}</b> <span class="mono">${c}</span><small>${ds}</small></span></label>`)}</fieldset>
        ${m.erro ? html`<p class="msg-erro" role="alert">${m.erro}</p>` : ''}
        <div class="form"><button type="submit" class="p">Continuar</button><button type="button" data-a="fechar">Cancelar</button></div></form>`
    } else if (m.passo === 2) {
      corpo = html`<div class="risco-box"><b>Esta manifestação não pode ser desfeita.</b> Ela é registrada na SEFAZ em nome de ${prod(it.prodId)?.nome} e tem efeito fiscal.</div>
        ${it.foraPrazo ? html`<div class="caixa-erro" style="background:var(--aviso-bg);color:var(--aviso);border-color:var(--aviso)">▲ O prazo desta nota passou (${it.prazo}). Manifestar pode ser recusado pela SEFAZ.</div>` : ''}
        ${m.rej ? html`<div class="caixa-erro" role="alert">✕ A SEFAZ recusou: o certificado não é do interessado (593).<small>É a limitação do nosso modelo: o certificado do contador não manifesta pelo produtor no Ambiente Nacional.</small></div>` : ''}
        <form class="form" data-s="man2" style="flex-direction:column;align-items:stretch"><div class="kv"><b>Ação</b><span>${t[1]} (<span class="mono">${t[0]}</span>)</span><b>Nota</b><span class="mono">${it.tipo} nº ${it.numero}</span></div>
          <label>Digite o número da nota para confirmar<input id="m-num" name="numero" inputmode="numeric" autocomplete="off" ${raw(m.erro ? 'aria-invalid="true"' : '')}></label>
          <label>Responsável (obrigatório)<input name="resp" autocomplete="off"></label><label>Motivo ou observação<input name="motivo" autocomplete="off"></label>
          ${m.erro ? html`<p class="msg-erro" role="alert">${m.erro}</p>` : ''}
          <div class="form"><button type="submit" class="risco">Manifestar</button><button type="button" data-a="man-volt">Voltar</button></div></form>`
    } else if (m.passo === 'envio') {
      corpo = html`<div class="cartao" role="status">◐ Enviando a manifestação… Não feche. Se a resposta demorar, o resultado fica no histórico.</div>`
    } else {
      corpo = html`<div class="cartao" role="status">○ Manifestação registrada em ${hoje()} · protocolo <span class="mono">000000000000000</span> (fictício).</div>
        <dl class="kv" style="margin-top:8px"><dt>Ação</dt><dd>${t[1]}</dd><dt>Quem</dt><dd>${m.resp} · origem: token</dd><dt>Resposta</dt><dd>cStat <span class="mono">${it.tipo === 'NF-e' ? '135' : '100'}</span> · evento registrado</dd></dl>
        <div class="form"><button type="button" class="p" data-a="fechar">Concluir</button><a href="#/importacoes" data-a="aba-cmd">Histórico de comandos →</a></div>`
    }
    return html`<div class="cortina" data-a="${m.passo === 'envio' ? '' : 'fechar'}"></div>
    <div class="dlg" role="dialog" aria-modal="true" aria-labelledby="d-tit" tabindex="-1" id="dlg" style="width:min(600px,94%)">
      <h2 id="d-tit">Manifestar ${it.tipo}</h2>${stepper(['Escolher', 'Confirmar', 'Registro'], m.passo === 1 ? 1 : m.passo === 2 || m.passo === 'envio' ? 2 : 3)}${corpo}</div>`
  }

  // ================= ações =================
  const AC = {
    'cert-abrir': () => { M.cert = { passo: 1, arq: '', erro: null, outro: false }; S.dlg = 'cert'; render() },
    'cert-prox': () => { M.cert.passo = 3; M.cert.erro = null; render() },
    'cert-volt': () => { M.cert.passo = M.cert.passo - 1 || 1; M.cert.erro = null; render() },
    'cert-reverter': () => {
      const ant = M.certs.find((c) => !c.ativo)
      if (ant) { M.certs = M.certs.filter((c) => c.ativo === false); ant.ativo = true }
      logCmd('Voltar ao certificado anterior', '(todos)', '—', 'conferência falhou', 'Executado')
      toast('Certificado anterior reativado.'); S.dlg = null; M.cert = null; render()
    },
    'imp-voltar': () => { M.imp.passo = 1; render() },
    'imp-novo': () => { M.imp = novoEstado().imp; render() },
    'imp-confirmar': () => {
      const I = M.imp, v = I.prev, p = prod(I.prod)
      const chaves = I.modo === 'chave' ? v.chavesNovas : Array.from({ length: Math.min(v.novas, 3) }, chaveFicticia)
      d().notas.unshift(...chaves.map((k) => notaImportada(p, k)))
      M.arquivos.unshift({ quando: hoje(), prodId: p.id, origem: ORIGEM[I.modo], arquivo: I.modo === 'chave' ? `${v.itens} chave${v.itens === 1 ? '' : 's'}` : I.arq, novas: v.novas, dup: v.dup, erros: v.erros.length })
      logCmd('Importar arquivo', p.nome, '—', ORIGEM[I.modo], `Executado · ${v.novas} novas`)
      I.res = { quando: hoje(), novas: v.novas, dup: v.dup, erros: v.erros.length }; I.passo = 3
      toast(`${v.novas} nota${v.novas === 1 ? '' : 's'} importada${v.novas === 1 ? '' : 's'}.`); render()
    },
    'aba-arq': () => { S.imp.aba = 'arquivos' },
    'aba-cmd': () => { S.imp.aba = 'comandos' },
    'vin-aba': (el) => { M.vin.aba = el.dataset.k; render() },
    'vin-filtro': (el) => { M.vin.filtro = el.dataset.k; render() },
    ligar: (el) => { M.lig = { cnpj: el.dataset.cnpj ?? '', cpfs: new Set(el.dataset.cpf ? [+el.dataset.cpf] : []), motivo: '', erro: null }; S.dlg = 'ligar'; render() },
    desligar: (el) => {
      const a = +el.dataset.cpf, b = +el.dataset.cnpj
      M.ligacoes = M.ligacoes.filter(([x, y]) => !(x === a && y === b))
      logCmd('Desligar CPF↔CNPJ', prod(a).nome, '—', `desligado de ${prod(b).nome}`, 'Executado')
      toast(`${prod(a).nome} desligado de ${prod(b).nome}. As demais ligações não mudam.`); render()
    },
    'man-aba': (el) => { M.man.aba = el.dataset.k; render() },
    manifestar: (el) => { const it = itemDe(el.dataset.chave); if (!it) return; M.mdlg = { item: it, passo: 1, tipo: '', erro: null, rej: false }; S.dlg = 'manif'; render() },
    'man-volt': () => { M.mdlg.passo = 1; M.mdlg.erro = null; M.mdlg.rej = false; render() },
  }
  const F = {
    'm-modo': (el) => { M.imp.modo = el.value; M.imp.erro = null; render() },
    'm-prod': (el) => { M.imp.prod = el.value },
    'm-arq': (el) => { M.imp.arq = el.value },
    'm-chaves': (el) => { M.imp.chaves = el.value },
    'l-cnpj': (el) => { M.lig.cnpj = el.value; render() },
    'l-cpf': (el) => { el.checked ? M.lig.cpfs.add(+el.value) : M.lig.cpfs.delete(+el.value); render() },
    'l-motivo': (el) => { M.lig.motivo = el.value },
    'n-lig': (el) => { S.notas.lig = el.checked; S.notas.mostrar = 12; render() },
  }
  const SUB = {
    cert1(form) {
      const c = M.cert, arq = form.arq.value, senha = form.senha.value
      c.arq = arq
      c.erro = !arq ? 'Escolha o arquivo do certificado.' : !/\.(pfx|p12)$/.test(arq) ? 'Formato não reconhecido: use .pfx ou .p12.' : !senha ? 'Informe a senha do certificado.' : senha === 'errada' ? 'Não foi possível abrir o certificado: senha incorreta ou arquivo corrompido. Nada foi gravado.' : null
      if (!c.erro) { c.passo = 2; c.outro = arq.includes('outro') }
      render(); if (c.erro) document.getElementById('c-senha')?.focus()
    },
    cert3(form) {
      const c = M.cert, motivo = form.motivo.value.trim()
      if (!motivo) { c.erro = 'Informe o motivo.'; render(); document.getElementById('c-motivo')?.focus(); return }
      M.certs.forEach((x) => { x.ativo = false })
      M.certs.unshift({ id: M.certs.length + 1, nome: c.outro ? 'Outro Titular Exemplo (A1)' : 'Contador Exemplo (A1)', serie: '00 00 00 01', titular: c.outro ? '***.111.111-**' : '***.000.000-**', tipo: 'A1 (PKCS12)', validade: '20/07/2028', dias: 607, ativo: true, cifrado: true, ultimoUso: '—' })
      SIM.cert = 'normal'; const sel = document.getElementById('cert-sim'); if (sel) sel.value = 'normal'
      logCmd('Trocar certificado', '(todos)', '—', motivo, 'Executado')
      c.passo = 4; c.erro = null; acompanhar(); toast('Certificado novo ativado. Acompanhando a primeira consulta de cada serviço.'); render()
    },
    imp1(form) {
      const I = M.imp
      I.modo = form.modo.value; I.prod = form.prod.value
      if (I.modo === 'chave') I.chaves = form.chaves.value; else I.arq = form.arq.value
      const a = ARQS[I.arq]
      I.erro = !I.prod ? 'Escolha o produtor.' : I.modo === 'chave' ? (I.chaves.trim() ? null : 'Cole ao menos uma chave de acesso.') : !I.arq ? 'Escolha o arquivo.' : a.invalido ? `Não foi possível ler o arquivo: ${a.invalido} Nada foi gravado.` : null
      if (!I.erro) { I.prev = previa(); I.passo = 2 }
      render()
    },
    ligar(form) {
      const L = M.lig, motivo = form.motivo.value.trim(), novos = paresNovos()
      L.motivo = motivo
      L.erro = !L.cnpj ? 'Escolha o CNPJ.' : !L.cpfs.size ? 'Marque ao menos um CPF.' : !novos.length ? 'Ligação já existe: estes CPFs já estão ligados a este CNPJ.' : !motivo ? 'Informe o motivo.' : null
      if (L.erro) { render(); return }
      novos.forEach((c) => M.ligacoes.push([c, +L.cnpj]))
      logCmd('Ligar CPF↔CNPJ', prod(+L.cnpj).nome, '—', motivo, `Executado · ${novos.length} ligaç${novos.length === 1 ? 'ão' : 'ões'}`)
      S.dlg = null; M.lig = null; toast(`${novos.length} ligaç${novos.length === 1 ? 'ão criada' : 'ões criadas'}. Nada foi baixado de novo.`); render()
    },
    man1(form) {
      const m = M.mdlg, t = form.tipo?.value
      if (!t) { m.erro = 'Escolha a manifestação.'; render(); return }
      m.tipo = t; m.erro = null; m.rej = false; m.passo = 2; render(); document.getElementById('m-num')?.focus()
    },
    man2(form) {
      const m = M.mdlg, it = m.item
      m.resp = form.resp.value.trim()
      m.erro = form.numero.value.trim() !== it.numero ? 'O número digitado não confere com o da nota.' : !m.resp ? 'Informe o responsável.' : null
      if (m.erro) { render(); document.getElementById('m-num')?.focus(); return }
      if (SIM.rej593 && it.tipo === 'NF-e') { m.rej = true; render(); return }
      m.passo = 'envio'; render()
      setTimeout(() => {
        if (M.mdlg !== m) return
        const t = TIPOS[it.tipo].find((x) => x[0] === m.tipo)
        it.estado = t[1]; it.quando = hoje()
        logCmd(`Manifestar (${t[0]})`, prod(it.prodId)?.nome ?? '—', it.tipo, form.motivo.value.trim() || t[1], 'Executado')
        m.passo = 3; if (S.dlg === 'manif') render()
      }, 1200)
    },
  }
  const dlg = () => (S.dlg === 'cert' ? dlgCert() : S.dlg === 'ligar' ? dlgLigar() : S.dlg === 'manif' ? dlgManif() : '')
  const reset = () => { M.cert = null; M.lig = null; M.mdlg = null }

  return { vCert, vImportar, vArquivos, vVinculos, vManif, dlg, AC, F, SUB, certTopo, certAlertas, chipLig, btnManif, ligados, pendentes, reset, reiniciar: () => { M = novoEstado() } }
}
