#!/usr/bin/env node
// node cli.js [файл.csv] [--json] [--out отчёт.csv]
import { readFileSync, writeFileSync } from 'node:fs'
import { calcAll, explain, toReportCsv } from './src/calc.js'

const args = process.argv.slice(2)
const outIdx = args.indexOf('--out')
const out = outIdx >= 0 ? args[outIdx + 1] : null
const file = args.find((a, i) => !a.startsWith('--') && (outIdx < 0 || i !== outIdx + 1)) ?? 'data/products.csv'

const { rows, errors } = calcAll(readFileSync(file, 'utf8'))

if (args.includes('--json')) {
  console.log(JSON.stringify({ rows, errors }))
} else {
  const toOrder = rows.filter(r => r.order > 0)
  console.log(`Товаров: ${rows.length}, к заказу: ${toOrder.length}, всего единиц: ${toOrder.reduce((s, r) => s + r.order, 0)}\n`)
  for (const r of toOrder) console.log(`ЗАКАЗАТЬ ${r.sku} ${r.name}: ${r.order} шт.\n  ${explain(r)}`)
  const ok = rows.filter(r => r.order === 0)
  if (ok.length) console.log('\nЗаказ не нужен:')
  for (const r of ok) console.log(`  ${r.sku} ${r.name}: ${explain(r)}`)
  if (errors.length) console.log('\nПропущены строки с ошибками:')
  for (const e of errors) console.log(`  строка ${e.line}${e.sku ? ` (${e.sku})` : ''}: ${e.message}`)
}

if (out) {
  writeFileSync(out, toReportCsv(rows))
  if (!args.includes('--json')) console.log(`\nОтчёт сохранён: ${out}`)
}
process.exitCode = errors.length ? 1 : 0
