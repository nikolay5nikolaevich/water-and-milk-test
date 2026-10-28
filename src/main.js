import { calcAll, explain, readCsv, toReportCsv } from './calc.js'
import sample from '../data/products.csv?raw'
import invalid from '../data/invalid.csv?raw'

const $ = id => document.getElementById(id)
const csv = $('csv')
const sources = { sample, invalid }
let rows = []
let current = 'sample'

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const plural = (n, one, few, many) => ({ one, few, many }[new Intl.PluralRules('ru').select(n)] ?? many)
const goods = n => `${n} ${plural(n, 'товар', 'товара', 'товаров')}`

// Шкала: синее — есть, штриховка — не хватает (заказ), светлое — сверх нужного
function bar(r) {
  const scale = Math.max(r.target, r.available, 1)
  const pct = v => (v / scale) * 100
  const have = pct(Math.min(r.available, r.target))
  const extra = pct(Math.max(0, r.available - r.target))
  return `
    <div class="bar" role="img" aria-label="Есть ${r.available} из нужных ${r.target}">
      <span class="have" style="width:${have}%"></span><span class="gap" style="width:${pct(r.order)}%"></span><span class="extra" style="width:${extra}%"></span>
      ${extra ? `<span class="mark" style="left:${pct(r.target)}%"></span>` : ''}
    </div>
    <div class="bar-label">есть ${r.available}, нужно ${r.target}</div>`
}

function row(r) {
  return `
    <li class="${r.order > 0 ? 'need' : ''}">
      <div class="name"><b>${esc(r.name)}</b><span class="sku">${esc(r.sku)}</span>
        <p class="why">${esc(explain(r))}</p></div>
      <div class="stock">${bar(r)}</div>
      <div class="order">${r.order > 0 ? `${r.order}<small>шт.</small>` : '<span class="ok">хватает</span>'}</div>
    </li>`
}

function render() {
  const res = calcAll(csv.value)
  rows = res.rows
  const toOrder = rows.filter(r => r.order > 0)
  const enough = rows.length - toOrder.length
  const units = toOrder.reduce((s, r) => s + r.order, 0)

  // Капс-строка + акцентная строка, как заголовки сцен сайта
  const [h1, h2] = !rows.length ? ['Нет данных', 'для расчёта']
    : toOrder.length ? [`Заказать ${goods(toOrder.length)}`, `на ${units} шт.`] : ['Заказывать', 'не нужно']
  $('headline').textContent = h1
  $('headline2').textContent = h2
  $('subline').textContent = !rows.length ? 'Загрузите CSV или выберите пример.'
    : enough ? `Ещё ${goods(enough)}: запаса хватает.` : 'Заказ нужен по всем товарам.'

  const errs = res.errors
  renderCheck(errs)
  $('errors').innerHTML = errs.length ? `
    <h3>${errs.length} ${plural(errs.length, 'строка не вошла', 'строки не вошли', 'строк не вошли')} в расчёт</h3>
    <p>Исправьте их в таблице и загрузите файл снова. Остальные товары посчитаны.</p>
    <ul>${errs.map(e => `<li><span class="ln">строка ${e.line}${e.sku ? `, ${esc(e.sku)}` : ''}</span>${esc(e.message)}</li>`).join('')}</ul>` : ''

  const shown = $('onlyOrder').checked ? toOrder : [...toOrder, ...rows.filter(r => r.order === 0)]
  $('rows').innerHTML = shown.length ? shown.map(row).join('')
    : `<li class="empty">${rows.length ? 'Все товары в достатке.' : 'Здесь появятся товары.'}</li>`

  $('detailRows').innerHTML = shown.length ? shown.map(detailRow).join('')
    : `<tr><td colspan="10" class="empty">${rows.length ? 'Все товары в достатке.' : 'Нет данных.'}</td></tr>`
}

// Исходный файл как есть: битые ячейки подсвечены, у строки статус
function renderCheck(errs) {
  const file = readCsv(csv.value)
  $('check').hidden = !errs.length || !file
  $('demoNote').hidden = current !== 'invalid'
  if ($('check').hidden) return

  const byLine = new Map(errs.map(e => [e.line, e]))
  const text = h => (h === 'sku' || h === 'name' ? 'l' : '')
  $('srcHead').innerHTML = `<tr><th>Строка</th>${file.header.map(h => `<th class="${text(h)}">${esc(h)}</th>`).join('')}<th>Статус</th></tr>`
  $('srcRows').innerHTML = file.rows.map(({ line, cells }) => {
    const e = byLine.get(line)
    const tds = file.header.map((h, j) => {
      const bad = e && (!e.fields.length || e.fields.includes(h))
      const v = cells[j] === undefined ? '<i>нет</i>' : cells[j] === '' ? '<i>пусто</i>' : esc(cells[j])
      return `<td class="${text(h)} ${bad ? 'bad' : ''}">${v}</td>`
    }).join('')
    return `<tr class="${e ? 'bad-row' : ''}"><td>${line}</td>${tds}
      <td class="st">${e ? 'исключена' : 'в расчёте'}</td></tr>`
  }).join('')
}

function detailRow(r) {
  return `
    <tr class="${r.order > 0 ? 'need' : ''}">
      <td><b>${esc(r.name)}</b><span class="sku">${esc(r.sku)}</span></td>
      <td>${r.stock}</td><td>${r.daily_sales}</td><td>${r.incoming}</td><td>${r.lead_days}</td><td>${r.safety_stock}</td>
      <td class="g-calc">${r.lead_days} + 7 = <b>${r.period}</b></td>
      <td class="g-calc">⌈${r.daily_sales} × ${r.period} + ${r.safety_stock}⌉ = <b>${r.target}</b></td>
      <td class="g-calc">${r.stock} + ${r.incoming} = <b>${r.available}</b></td>
      <td class="g-calc total">${r.order > 0 ? `${r.target} − ${r.available} = <b>${r.order}</b>` : '<b>0</b>'}</td>
    </tr>`
}

function load(text, src, label = 'Свой файл CSV') {
  csv.value = text.replace(/^﻿/, '')
  current = src
  document.querySelectorAll('[data-src]').forEach(b => b.setAttribute('aria-pressed', b.dataset.src === src))
  $('fileLabel').textContent = label
  document.querySelector('.file-btn').classList.toggle('active', src === 'file')
  render()
}

document.querySelectorAll('[data-src]').forEach(b => b.addEventListener('click', () => load(sources[b.dataset.src], b.dataset.src)))
$('file').addEventListener('change', async e => {
  const f = e.target.files[0]
  if (f) load(await f.text(), 'file', f.name)
  e.target.value = ''
})
$('onlyOrder').addEventListener('change', render)
csv.addEventListener('input', render)
$('download').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([toReportCsv(rows)], { type: 'text/csv;charset=utf-8' }))
  Object.assign(document.createElement('a'), { href: url, download: 'order-report.csv' }).click()
  URL.revokeObjectURL(url)
})

// ?data=invalid сразу открывает пример с ошибками
const start = new URLSearchParams(location.search).get('data') === 'invalid' ? 'invalid' : 'sample'
load(sources[start], start)
