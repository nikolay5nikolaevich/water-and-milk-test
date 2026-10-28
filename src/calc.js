// Расчёт заказа и разбор CSV. Общий модуль для сайта и CLI.

export const COVER_DAYS = 7
export const FIELDS = ['sku', 'name', 'stock', 'daily_sales', 'incoming', 'lead_days', 'safety_stock']
const INT_FIELDS = ['stock', 'incoming', 'lead_days', 'safety_stock']

// 0.1 * 30 в float даёт 3.0000000000000004, без поправки ceil вернул бы 4
const EPS = 1e-9

export function calcOrder(p) {
  const period = p.lead_days + COVER_DAYS
  const target = Math.ceil(p.daily_sales * period + p.safety_stock - EPS)
  const available = p.stock + p.incoming
  const order = Math.max(0, target - available)
  return { ...p, period, target, available, order }
}

export function explain(r) {
  const head = `${r.daily_sales} × (${r.lead_days} + ${COVER_DAYS}) + ${r.safety_stock} → целевой ${r.target}; ` +
    `доступно ${r.stock} + ${r.incoming} = ${r.available}`
  return r.order > 0 ? `${head}; заказ ${r.target} − ${r.available} = ${r.order}` : `${head}; запаса хватает`
}

// Разбор одной строки CSV с поддержкой кавычек ("Молоко, 3.2%")
function splitLine(line, sep) {
  const out = []
  let cur = '', quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') quoted = false
      else cur += c
    } else if (c === '"') quoted = true
    else if (c === sep) { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out.map(s => s.trim())
}

// Возвращает { products, errors }: битые строки не попадают в расчёт, а описываются в errors
export function parseCsv(text) {
  const file = readCsv(text)
  if (!file) return { products: [], errors: [{ line: 0, message: 'Файл пустой', fields: [] }] }

  const { header, headerLine } = file
  const missing = FIELDS.filter(f => !header.includes(f))
  if (missing.length) {
    return { products: [], errors: [{ line: headerLine, message: `Нет столбцов: ${missing.join(', ')}`, fields: [] }] }
  }

  const products = [], errors = [], seen = new Set()
  for (const { line, cells } of file.rows) {
    const raw = Object.fromEntries(header.map((h, j) => [h, cells[j] ?? '']))
    const problems = validate(raw, cells.length !== header.length, seen)
    if (problems.length) {
      // fields — какие ячейки подсветить; пустой список = вся строка
      errors.push({ line, sku: raw.sku, message: problems.map(p => p[1]).join('; '), fields: problems.map(p => p[0]).filter(Boolean) })
      continue
    }
    seen.add(raw.sku)
    products.push({
      sku: raw.sku,
      name: raw.name,
      daily_sales: Number(raw.daily_sales.replace(',', '.')),
      ...Object.fromEntries(INT_FIELDS.map(f => [f, Number(raw[f])])),
    })
  }
  return { products, errors }
}

// Строки файла как есть, без проверки: { header, headerLine, rows: [{ line, cells }] } или null для пустого файла
export function readCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  const headerIdx = lines.findIndex(l => l.trim())
  if (headerIdx < 0) return null
  // Excel в русской локали сохраняет CSV через «;»
  const sep = lines[headerIdx].includes(';') ? ';' : ','
  const rows = []
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (lines[i].trim()) rows.push({ line: i + 1, cells: splitLine(lines[i], sep) })
  }
  return { header: splitLine(lines[headerIdx], sep).map(h => h.toLowerCase()), headerLine: headerIdx + 1, rows }
}

// Возвращает пары [поле, текст ошибки]
function validate(raw, wrongCount, seen) {
  if (wrongCount) return [[null, 'неверное число столбцов']]
  const problems = []
  if (!raw.sku) problems.push(['sku', 'пустой sku'])
  else if (seen.has(raw.sku)) problems.push(['sku', `повтор sku ${raw.sku}`])
  if (!raw.name) problems.push(['name', 'пустое name'])
  for (const f of INT_FIELDS) {
    if (!/^\d+$/.test(raw[f])) problems.push([f, `${f} = «${raw[f]}»: нужно целое число ≥ 0`])
  }
  if (!/^\d+([.,]\d+)?$/.test(raw.daily_sales)) problems.push(['daily_sales', `daily_sales = «${raw.daily_sales}»: нужно число ≥ 0`])
  return problems
}

export function calcAll(text) {
  const { products, errors } = parseCsv(text)
  return { rows: products.map(calcOrder), errors }
}

export function toReportCsv(rows) {
  const cols = ['sku', 'name', 'stock', 'incoming', 'daily_sales', 'lead_days', 'safety_stock', 'period', 'target', 'available', 'order']
  const esc = v => (/[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)
  // «;» и BOM, чтобы Excel в русской локали открыл файл по столбцам
  return '﻿' + [cols.join(';'), ...rows.map(r => cols.map(c => esc(r[c])).join(';'))].join('\r\n')
}
