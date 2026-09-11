export function criarModuloEstoque({ supabase, getCervejaria, getUsuario, escapeHtml }) {
  let itens = []
  let filtro = 'Chopp'
  const n = v => Number(v || 0)
  const $id = id => document.getElementById(id)
  const unidades = ['kg', 'g', 'L', 'quantidade', 'pacotes']
  const choppProdutos = [
    ['Barril de Pilsen 50 L', 'quantidade'],
    ['Barril de Pilsen 30 L', 'quantidade'],
    ['Barril de vinho 50 L', 'quantidade'],
    ['Barril de vinho 30 L', 'quantidade'],
    ['Growler de Pilsen 1 L', 'quantidade'],
    ['Growler de vinho 1 L', 'quantidade'],
    ['Pilsen no fermentador', 'L'],
    ['Chope de vinho no fermentador', 'L']
  ]
  const insumoUnidade = { Malte: 'kg', Lupulo: 'g', Fermento: 'pacotes', CorrecaoAgua: 'g' }
  const rotuloSub = { Malte: 'Malte', Lupulo: 'Lúpulo', Fermento: 'Fermento', CorrecaoAgua: 'Correção da água' }

  async function carregar() {
    const { data, error } = await supabase.from('estoque_itens').select('*')
      .eq('cervejaria_id', getCervejaria()).order('nome')
    if (error) throw error
    itens = data || []
  }

  async function abrir(container) {
    await carregar()
    render(container)
  }

  function disponivel(x) { return Math.max(0, n(x.quantidade_atual) - n(x.quantidade_reservada)) }
  function unidadeLabel(u) { return u === 'quantidade' ? 'un.' : u }
  function emoji(x) {
    if (x.categoria === 'Chopp') return x.nome.toLowerCase().includes('vinho') ? '🍷' : x.nome.toLowerCase().includes('fermentador') ? '🧪' : '🍺'
    if (x.categoria === 'InsumoReceita') return x.subcategoria === 'Malte' ? '🌾' : x.subcategoria === 'Lupulo' ? '🌿' : x.subcategoria === 'Fermento' ? '🧫' : '🧪'
    return '📦'
  }

  function render(container) {
    const lista = itens.filter(x => x.categoria === filtro)
    container.innerHTML = `<div class="stock-toolbar"><div class="stock-tabs">
      <button data-stock="Chopp" class="${filtro === 'Chopp' ? 'on' : ''}">🍺 Chope e growlers</button>
      <button data-stock="InsumoReceita" class="${filtro === 'InsumoReceita' ? 'on' : ''}">🌾 Insumos das receitas</button>
      <button data-stock="Outro" class="${filtro === 'Outro' ? 'on' : ''}">📦 Outros</button>
    </div><button class="btn" id="novoEstoque">＋ Adicionar item</button></div>
    ${filtro === 'Chopp' ? resumoChopp(lista) : ''}
    <div class="stock-grid">${lista.map(card).join('') || '<div class="empty">Nenhum item cadastrado nesta categoria</div>'}</div>`
    container.querySelectorAll('[data-stock]').forEach(b => b.onclick = () => { filtro = b.dataset.stock; render(container) })
    $id('novoEstoque').onclick = () => abrirForm(container)
    container.querySelectorAll('[data-edit-stock]').forEach(b => b.onclick = () => abrirForm(container, itens.find(x => x.id === b.dataset.editStock)))
    container.querySelectorAll('[data-delete-stock]').forEach(b => b.onclick = () => apagar(container, b.dataset.deleteStock))
  }

  function resumoChopp(lista) {
    const total = lista.reduce((a, x) => a + n(x.quantidade_atual), 0)
    const reservado = lista.reduce((a, x) => a + n(x.quantidade_reservada), 0)
    return `<div class="stock-summary"><div><small>Itens cadastrados</small><b>${lista.length}</b></div><div><small>Total informado</small><b>${total}</b></div><div><small>Total reservado</small><b>${reservado}</b></div></div>`
  }

  function card(x) {
    const un = unidadeLabel(x.unidade)
    const detalhes = x.categoria === 'Chopp'
      ? `<div class="stock-values"><span><small>Total</small><b>${n(x.quantidade_atual)} ${un}</b></span><span><small>Reservado</small><b>${n(x.quantidade_reservada)} ${un}</b></span><span class="available"><small>Disponível</small><b>${disponivel(x)} ${un}</b></span></div>`
      : `<div class="stock-current"><small>Quantidade atual</small><b>${n(x.quantidade_atual)} ${un}</b></div>`
    return `<article class="stock-card"><div class="stock-card-head"><div><small>${x.subcategoria ? escapeHtml(rotuloSub[x.subcategoria] || x.subcategoria) : escapeHtml(x.categoria === 'Outro' ? 'Outros' : 'Chope e growlers')}</small><h3>${emoji(x)} ${escapeHtml(x.nome)}</h3></div></div>${detalhes}${x.observacao ? `<p>${escapeHtml(x.observacao)}</p>` : ''}<div class="stock-actions"><button data-edit-stock="${x.id}">✎ Editar</button><button class="danger" data-delete-stock="${x.id}">🗑 Apagar</button></div></article>`
  }

  function abrirForm(container, item = null) {
    const categoria = item?.categoria || filtro
    const subcategoria = item?.subcategoria || (categoria === 'InsumoReceita' ? 'Malte' : '')
    const unidade = item?.unidade || (categoria === 'Chopp' ? 'quantidade' : categoria === 'InsumoReceita' ? insumoUnidade[subcategoria] : 'quantidade')
    container.insertAdjacentHTML('beforeend', `<div class="stock-modal-bg" id="stockModal"><form class="stock-modal" id="stockForm"><div class="stock-modal-head"><h2>${item ? 'Editar' : 'Adicionar'} item</h2><button type="button" id="fecharEstoque">✕</button></div>
      <label class="field">Categoria<select name="categoria" id="estoqueCategoria"><option value="Chopp" ${categoria === 'Chopp' ? 'selected' : ''}>Chope e growlers</option><option value="InsumoReceita" ${categoria === 'InsumoReceita' ? 'selected' : ''}>Insumos das receitas</option><option value="Outro" ${categoria === 'Outro' ? 'selected' : ''}>Outros</option></select></label>
      <div id="stockDynamic"></div><label class="field">Observação<input name="observacao" value="${escapeHtml(item?.observacao || '')}"></label><p class="error" id="stockError"></p><div class="modalactions"><button type="button" class="btn alt" id="cancelarEstoque">Cancelar</button><button class="btn">Salvar</button></div></form></div>`)
    const cat = $id('estoqueCategoria')
    const dynamic = () => renderCampos(cat.value, item, subcategoria, unidade)
    cat.onchange = dynamic
    dynamic()
    $id('fecharEstoque').onclick = $id('cancelarEstoque').onclick = () => $id('stockModal').remove()
    $id('stockForm').onsubmit = e => salvar(e, container, item?.id)
  }

  function renderCampos(cat, item, sub, un) {
    if (cat === 'Chopp') {
      const selecionado = item?.nome || choppProdutos[0][0]
      $id('stockDynamic').innerHTML = `<label class="field">Produto<select name="nome" id="choppProduto">${choppProdutos.map(([p]) => `<option ${p === selecionado ? 'selected' : ''}>${p}</option>`).join('')}</select></label><input type="hidden" name="unidade" id="choppUnidade"><div class="stock-form-grid"><label class="field">Quantidade total<input name="quantidade_atual" type="number" step="0.001" min="0" value="${item?.quantidade_atual ?? 0}" required></label><label class="field">Quantidade reservada<input name="quantidade_reservada" type="number" step="0.001" min="0" value="${item?.quantidade_reservada ?? 0}" required></label></div><div class="stock-help">Disponível será calculado automaticamente: total menos reservado.</div>`
      const definirUn = () => { $id('choppUnidade').value = choppProdutos.find(([p]) => p === $id('choppProduto').value)?.[1] || 'quantidade' }
      $id('choppProduto').onchange = definirUn; definirUn()
    } else if (cat === 'InsumoReceita') {
      $id('stockDynamic').innerHTML = `<label class="field">Tipo<select name="subcategoria" id="insumoTipo">${Object.keys(insumoUnidade).map(k => `<option value="${k}" ${k === sub ? 'selected' : ''}>${rotuloSub[k]}</option>`).join('')}</select></label><label class="field">Nome ou tipo<input name="nome" value="${escapeHtml(item?.nome || '')}" required></label><input type="hidden" name="unidade" id="insumoUnidade"><label class="field">Quantidade atual<input name="quantidade_atual" type="number" step="0.001" min="0" value="${item?.quantidade_atual ?? 0}" required></label><input type="hidden" name="quantidade_reservada" value="0">`
      const definirUn = () => { $id('insumoUnidade').value = insumoUnidade[$id('insumoTipo').value] }
      $id('insumoTipo').onchange = definirUn; definirUn()
    } else {
      $id('stockDynamic').innerHTML = `<label class="field">Nome do item<input name="nome" value="${escapeHtml(item?.nome || '')}" required></label><label class="field">Unidade<select name="unidade">${unidades.map(u => `<option value="${u}" ${u === un ? 'selected' : ''}>${unidadeLabel(u)}</option>`).join('')}</select></label><label class="field">Quantidade atual<input name="quantidade_atual" type="number" step="0.001" min="0" value="${item?.quantidade_atual ?? 0}" required></label><input type="hidden" name="quantidade_reservada" value="0">`
    }
  }

  async function salvar(e, container, id) {
    e.preventDefault()
    const f = new FormData(e.target)
    const obj = { cervejaria_id: getCervejaria(), usuario_id: getUsuario(), categoria: f.get('categoria'), subcategoria: f.get('subcategoria') || null, nome: f.get('nome'), unidade: f.get('unidade'), quantidade_atual: n(f.get('quantidade_atual')), quantidade_reservada: n(f.get('quantidade_reservada')), observacao: f.get('observacao') || null, atualizado_em: new Date().toISOString() }
    if (obj.quantidade_reservada > obj.quantidade_atual) { $id('stockError').textContent = 'A quantidade reservada não pode ser maior que a quantidade total.'; return }
    const q = id ? supabase.from('estoque_itens').update(obj).eq('id', id) : supabase.from('estoque_itens').insert(obj)
    const { error } = await q
    if (error) { $id('stockError').textContent = error.message; return }
    $id('stockModal').remove(); await carregar(); filtro = obj.categoria; render(container)
  }

  async function apagar(container, id) {
    const item = itens.find(x => x.id === id)
    if (!item || !window.confirm(`Apagar o item "${item.nome}" do estoque?`)) return
    const { error } = await supabase.from('estoque_itens').delete().eq('id', id)
    if (error) return alert(error.message)
    itens = itens.filter(x => x.id !== id); render(container)
  }

  async function dashboardHtml() {
    await carregar()
    const lista = itens.filter(x => x.categoria === 'Chopp').slice(0, 10)
    return `<div class="card stock-dashboard"><div class="section-head"><h3>🍺 Estoque de chope</h3><button class="link" onclick="go('stock')">Ver estoque</button></div><div class="preview">${lista.map(x => `<div class="row"><div class="grow"><b>${emoji(x)} ${escapeHtml(x.nome)}</b><small>Reservado: ${n(x.quantidade_reservada)} ${unidadeLabel(x.unidade)}</small></div><b>${disponivel(x)} ${unidadeLabel(x.unidade)} disponíveis</b></div>`).join('') || empty()}</div><small>Exibindo até 10 itens</small></div>`
  }
  return { abrir, dashboardHtml }
}
