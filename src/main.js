import './style.css'
import './receitas.css'
import { supabase } from './supabase.js'
import { criarModuloReceitas } from './receitas.js'

const $ = s => document.querySelector(s)
const money = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const bd = v => v ? new Date(v + 'T12:00:00').toLocaleDateString('pt-BR') : ''
const today = () => new Date().toISOString().slice(0, 10)
const pe = p => p === 'Growler de vinho' ? '🍷' : p === 'Barril reserva' ? '🛢️' : '🍺'
const products = ['Barril', 'Growler de vinho', 'Growler de Pilsen', 'Barril reserva']

let session = null
let brewery = null
let page = 'dashboard'
let modal = null
let editing = null
let items = []
let channel = null
let data = { movimentacoes: [], entregas: [], contas_pagar: [], valores_receber: [] }
const app = $('#app')

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]))
const status = (x, k) => x.status === 'Pago' ? 'Pago' : x[k] < today() ? 'Atrasado' : 'Pendente'
const empty = () => '<div class="empty">Nenhum registro cadastrado</div>'

const moduloReceitas = criarModuloReceitas({
  supabase,
  getCervejaria: () => brewery.cervejaria_id,
  getUsuario: () => session.user.id,
  escapeHtml: esc
})

async function start() {
  session = (await supabase.auth.getSession()).data.session
  if (session) await enter(); else login()
  supabase.auth.onAuthStateChange(async (_, s) => {
    session = s
    if (s) await enter(); else login()
  })
}

function login() {
  app.innerHTML = `<div class="login"><form class="loginbox" id="login"><img class="login-logo" src="/logo-ze-parroti.jpg" alt="Logo Zé Parroti"><h1>Gestão Zé Parroti</h1><p>Entre para acessar os dados compartilhados.</p><label class="field">E-mail<input name="email" type="email" required></label><label class="field">Senha<input name="password" type="password" required></label><p class="error" id="err"></p><button class="btn full">Entrar</button></form></div>`
  $('#login').onsubmit = async e => {
    e.preventDefault()
    const f = new FormData(e.target)
    const { error } = await supabase.auth.signInWithPassword({ email: f.get('email'), password: f.get('password') })
    if (error) $('#err').textContent = error.message
  }
}

async function enter() {
  const { data: m } = await supabase.from('usuarios_cervejaria').select('cervejaria_id,nome,funcao,cervejarias(nome)').eq('usuario_id', session.user.id).limit(1).maybeSingle()
  if (!m) {
    app.innerHTML = '<div class="login"><div class="loginbox"><h2>Acesso não vinculado</h2><button class="btn" onclick="logout()">Sair</button></div></div>'
    return
  }
  brewery = m
  await load()
  sub()
  render()
}

async function load() {
  const id = brewery.cervejaria_id
  const rs = await Promise.all([
    supabase.from('movimentacoes').select('*').eq('cervejaria_id', id).order('data', { ascending: false }),
    supabase.from('entregas').select('*,entrega_itens(*)').eq('cervejaria_id', id).order('data_entrega'),
    supabase.from('contas_pagar').select('*').eq('cervejaria_id', id).order('data_vencimento'),
    supabase.from('valores_receber').select('*').eq('cervejaria_id', id).order('data_combinada')
  ])
  ;['movimentacoes', 'entregas', 'contas_pagar', 'valores_receber'].forEach((k, i) => data[k] = rs[i].data || [])
  const bad = rs.find(r => r.error)
  if (bad) alert(bad.error.message)
}

function sub() {
  if (channel) supabase.removeChannel(channel)
  channel = supabase.channel('v6').on('postgres_changes', { event: '*', schema: 'public' }, async () => {
    await load(); render()
  }).subscribe()
}

window.logout = () => supabase.auth.signOut()
window.go = p => { page = p; render() }

const pages = {
  dashboard: '📊 Dashboard', finance: '💰 Financeiro', deliveries: '🚚 Entregas',
  bills: '📅 Contas a pagar', receive: '👥 Clientes devendo', recipes: '📖 Receitas'
}

function metric(t, v, e, cl = '') {
  return `<div class="card metric"><div><small>${t}</small><strong class="${cl}">${v}</strong></div><span class="emoji">${e}</span></div>`
}
function act(k, x) {
  return `<div class="actions"><button onclick="editRow('${k}','${x.id}')">✎</button><button onclick="delRow('${k}','${x.id}')">🗑</button></div>`
}

function render() {
  app.innerHTML = `<header class="top"><span class="brand"><img class="header-logo" src="/logo-ze-parroti.jpg" alt="Logo Zé Parroti"> Gestão Zé Parroti</span><button class="btn alt" onclick="logout()">Sair</button></header><nav class="tabs">${Object.entries(pages).map(([k, v]) => `<button class="${page === k ? 'on' : ''}" onclick="go('${k}')">${v}</button>`).join('')}</nav><main class="main"><div class="head"><h1>${pages[page]}</h1>${!['dashboard','recipes'].includes(page) ? '<button class="btn" id="add">＋ Adicionar</button>' : ''}</div><div id="content"></div></main>`
  const telas = {
    dashboard, finance, deliveries, bills, receive: receivables,
    recipes: () => moduloReceitas.abrir(document.querySelector('#content'))
  }
  telas[page]()
  if ($('#add')) $('#add').onclick = () => openModal(page)
}

function preview(title, arr, fn) {
  return `<div class="card"><div class="section-head"><h3>${title}</h3></div><div class="preview">${arr.slice(0, 10).map(fn).join('') || empty()}</div><small>Exibindo até 10 itens</small></div>`
}
function dashboard() {
  const bal = data.movimentacoes.reduce((a, x) => a + (x.tipo === 'Entrada' ? +x.valor : -x.valor), 0)
  const bs = data.contas_pagar.filter(x => status(x, 'data_vencimento') !== 'Pago')
  const rs = data.valores_receber.filter(x => status(x, 'data_combinada') !== 'Pago')
  $('#content').innerHTML = `<div class="metrics">${metric('Saldo em conta', money(bal), '💰')}${metric('Próximas entregas', data.entregas.length, '🍺')}${metric('Contas a pagar', money(bs.reduce((a, x) => a + (+x.valor), 0)), '📅', 'redtext')}${metric('Valores a receber', money(rs.reduce((a, x) => a + (+x.valor), 0)), '💵')}</div><div class="dashboard-grid">${preview('🚚 Próximas entregas', data.entregas, x => rowDelivery(x, false))}${preview('📅 Contas a pagar', bs, x => `<div class="row"><div class="grow"><b>${esc(x.descricao)}</b><small>${bd(x.data_vencimento)} • ${status(x, 'data_vencimento')}</small></div><b class="redtext">${money(x.valor)}</b></div>`)}${preview('👥 Clientes devendo', rs, x => `<div class="row"><div class="grow"><b>${esc(x.cliente)}</b><small>${esc(x.descricao)}</small></div><b>${money(x.valor)}</b></div>`)}</div>`
}
function finance() {
  const bal = data.movimentacoes.reduce((a, x) => a + (x.tipo === 'Entrada' ? +x.valor : -x.valor), 0)
  $('#content').innerHTML = metric('Saldo em conta', money(bal), '💰') + data.movimentacoes.map(x => `<div class="row"><div class="grow"><b>${x.tipo === 'Entrada' ? '🟢' : '🔴'} ${esc(x.descricao)}</b><small>${bd(x.data)} • ${x.tipo}</small></div><b>${x.tipo === 'Entrada' ? '+' : '-'} ${money(x.valor)}</b>${act('finance', x)}</div>`).join('')
}
function chips(x) { return `<div class="chips">${(x.entrega_itens || []).map(i => `<span class="chip">${pe(i.produto)} ${esc(i.produto)} • ${i.quantidade} un. • ${i.litros} L</span>`).join('')}</div>` }
function rowDelivery(x, actions = true) { return `<div class="row"><div class="grow"><b>🚚 ${esc(x.cliente)}</b><small>${bd(x.data_entrega)} às ${x.horario_entrega?.slice(0, 5)} • 📍 ${esc(x.local_entrega)}</small>${chips(x)}</div><b>${money(x.valor)}</b>${actions ? act('deliveries', x) : ''}</div>` }
function deliveries() { $('#content').innerHTML = data.entregas.map(x => rowDelivery(x)).join('') || empty() }
function debt(k, x, dk) { const st = status(x, dk); return `<div class="row"><div class="grow"><b>${k === 'receive' ? '👤 ' + esc(x.cliente) : '🧾 ' + esc(x.descricao)} <span class="status ${st === 'Pago' ? 'paid' : st === 'Atrasado' ? 'late' : ''}">${st}</span></b><small>${k === 'receive' ? esc(x.descricao) + ' • ' : ''}${bd(x[dk])}</small></div><b class="${k === 'bills' ? 'redtext' : ''}">${money(x.valor)}</b>${st !== 'Pago' ? `<button onclick="pay('${k}','${x.id}')">✓ ${k === 'receive' ? 'Recebido' : 'Pago'}</button>` : ''}${act(k, x)}</div>` }
function bills() { $('#content').innerHTML = data.contas_pagar.map(x => debt('bills', x, 'data_vencimento')).join('') || empty() }
function receivables() { $('#content').innerHTML = data.valores_receber.map(x => debt('receive', x, 'data_combinada')).join('') || empty() }

const cfg = {
  finance: { table: 'movimentacoes', fields: [['data','Data','date'],['descricao','Descrição','text'],['valor','Valor','number'],['tipo','Tipo','select',['Entrada','Saida']]] },
  bills: { table: 'contas_pagar', fields: [['descricao','Descrição','text'],['valor','Valor','number'],['data_vencimento','Vencimento','date'],['status','Status','select',['Pendente','Pago','Atrasado']]] },
  receive: { table: 'valores_receber', fields: [['cliente','Cliente','text'],['descricao','Descrição','text'],['valor','Valor','number'],['data_combinada','Data combinada','date'],['status','Status','select',['Pendente','Pago','Atrasado']]] },
  deliveries: { table: 'entregas', fields: [['cliente','Cliente','text'],['data_entrega','Data','date'],['horario_entrega','Horário','time'],['valor','Valor','number'],['local_entrega','Local','text']] }
}
function field(k, l, t, opts, v) { if (t === 'select') return `<label class="field">${l}<select name="${k}">${opts.map(o => `<option ${v === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`; return `<label class="field ${['cliente','descricao','local_entrega'].includes(k) ? 'full' : ''}">${l}<input name="${k}" type="${t}" step="0.01" value="${esc(v ?? '')}"></label>` }
function itemEditor() { return `<div class="full"><b>📦 Itens do pedido</b><button type="button" class="btn alt" onclick="addItem()">+ Item</button><div id="items">${items.map((x, i) => `<div class="item"><select onchange="setItem(${i},'produto',this.value)">${products.map(p => `<option ${p === x.produto ? 'selected' : ''}>${p}</option>`).join('')}</select><input type="number" value="${x.quantidade}" onchange="setItem(${i},'quantidade',this.value)" placeholder="Qtd."><input type="number" value="${x.litros}" onchange="setItem(${i},'litros',this.value)" placeholder="Litros"><button type="button" onclick="removeItem(${i})">🗑</button></div>`).join('')}</div></div>` }
function openModal(k, obj = {}) { modal = k; editing = obj.id || null; items = k === 'deliveries' ? (obj.entrega_itens || []).map(i => ({ produto:i.produto, quantidade:i.quantidade, litros:i.litros })) : []; if (k === 'deliveries' && !items.length) items = [{ produto:'Barril', quantidade:1, litros:50 }]; const c = cfg[k]; document.body.insertAdjacentHTML('beforeend', `<div class="modalbg" id="modal"><form class="modal" id="form"><h2>${editing ? 'Editar' : 'Adicionar'} registro</h2><div class="formgrid">${c.fields.map(f => field(...f, obj[f[0]])).join('')}${k === 'deliveries' ? itemEditor() : ''}</div><p class="error" id="formerr"></p><div class="modalactions"><button type="button" class="btn alt" onclick="closeModal()">Cancelar</button><button class="btn">Salvar</button></div></form></div>`); $('#form').onsubmit = save }
function refreshItems() { const box = $('#items'); if (box) box.innerHTML = items.map((x, i) => `<div class="item"><select onchange="setItem(${i},'produto',this.value)">${products.map(p => `<option ${p === x.produto ? 'selected' : ''}>${p}</option>`).join('')}</select><input type="number" value="${x.quantidade}" onchange="setItem(${i},'quantidade',this.value)"><input type="number" value="${x.litros}" onchange="setItem(${i},'litros',this.value)"><button type="button" onclick="removeItem(${i})">🗑</button></div>`).join('') }
window.addItem = () => { items.push({ produto:'Barril', quantidade:1, litros:50 }); refreshItems() }
window.setItem = (i, k, v) => items[i][k] = v
window.removeItem = i => { items.splice(i, 1); refreshItems() }
window.closeModal = () => $('#modal')?.remove()

async function save(e) {
  e.preventDefault(); const c = cfg[modal], f = new FormData(e.target), obj = { cervejaria_id:brewery.cervejaria_id, usuario_id:session.user.id }
  for (const [k] of c.fields) obj[k] = f.get(k) || null
  if (modal === 'deliveries') { obj.litros = items.reduce((a, i) => a + (+i.litros || 0), 0); obj.barril_reserva = items.some(i => i.produto === 'Barril reserva'); obj.litros_barril_reserva = items.filter(i => i.produto === 'Barril reserva').reduce((a, i) => a + (+i.litros || 0), 0) || null }
  const q = editing ? supabase.from(c.table).update(obj).eq('id', editing).select().single() : supabase.from(c.table).insert(obj).select().single()
  const { data:saved, error } = await q
  if (error) { $('#formerr').textContent = error.message; return }
  if (modal === 'deliveries') { await supabase.from('entrega_itens').delete().eq('entrega_id', saved.id); const rows = items.map(i => ({ entrega_id:saved.id, cervejaria_id:brewery.cervejaria_id, usuario_id:session.user.id, produto:i.produto, quantidade:+i.quantidade, litros:+i.litros })); if (rows.length) { const { error:e2 } = await supabase.from('entrega_itens').insert(rows); if (e2) { $('#formerr').textContent = e2.message; return } } }
  closeModal(); await load(); render()
}
window.editRow = (k, id) => { const c = cfg[k], obj = data[c.table].find(x => x.id === id); openModal(k, obj) }
window.delRow = async (k, id) => { if (!confirm('Apagar este registro?')) return; const { error } = await supabase.from(cfg[k].table).delete().eq('id', id); if (error) alert(error.message); else { await load(); render() } }
window.pay = async (k, id) => { const obj = k === 'receive' ? { status:'Pago', data_recebimento:today() } : { status:'Pago', data_pagamento:today() }; await supabase.from(cfg[k].table).update(obj).eq('id', id); await load(); render() }

start()
