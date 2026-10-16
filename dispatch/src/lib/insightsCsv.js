// "Export insight report": the Insights & sales numbers on screen, as a CSV
// that opens in Excel / Google Sheets — one file, a section per table
// (backend views.insights_sales_view gives the data). Saved with a UTF-8 BOM
// so Excel shows Khmer post titles correctly.

const cell = (v) => {
  const s = v == null ? '' : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}
const line = (cells) => cells.map(cell).join(',')

export function insightsCsv(data, { brand, period, goals = [] }) {
  const out = []
  const section = (title, header, rows) => {
    out.push('', line([title]), line(header))
    if (!rows.length) out.push(line(['(none in this period)']))
    rows.forEach((r) => out.push(line(r)))
  }

  out.push(line(['Marketing ឆ្លាតវៃ · Insights & sales report']))
  out.push(line(['Brand', brand]))
  out.push(line(['Period', period]))
  out.push(line(['Exported', new Date().toLocaleString('en-GB')]))

  const kpi = (k, label) => [label, data[k]?.raw ?? '', data[k]?.sub ?? '']
  section('Key numbers', ['Metric', 'Value', 'Note'], [
    kpi('reach', 'Reach'),
    kpi('followers', 'New followers'),
    kpi('engagementRate', 'Engagement rate (%)'),
    kpi('leads', 'Leads'),
    kpi('dealsWon', 'Deals won'),
    kpi('revenue', 'Revenue (USD)'),
  ])

  section(
    'By content goal',
    ['Goal', 'Stage', 'KPI', 'Posts', 'Result', 'Change', 'Status'],
    goals
      .filter((g) => data.goals?.[g.id])
      .map((g) => {
        const r = data.goals[g.id]
        return [g.label, g.stage, g.kpi, r.posts, r.result, r.change, r.status]
      }),
  )

  section(
    'By channel',
    ['Channel', 'Reach', 'New followers', 'Leads', 'Won', 'Revenue', 'Ad spend', 'Cost per lead'],
    (data.by_channel || []).map((c) => [c.channel, c.reach, c.follows, c.leads, c.won, c.revenue, c.spend, c.cost_per_lead]),
  )

  section(
    'Funnel',
    ['Stage', 'Count', 'Of the step before'],
    (data.funnel || []).map((f) => [f.stage, f.raw ?? f.count, f.pct || '']),
  )

  section(
    'Content that sold',
    ['Post', 'Leads · won', 'Revenue'],
    (data.content_that_sold || []).map((c) => [c.title, c.sub, c.revenue]),
  )

  section(
    'Recommendations',
    ['Recommendation', 'Why', 'Based on'],
    (data.recommendations || []).map((r) => [r.title, r.description, r.confidence]),
  )

  if (data.note) out.push('', line(['Note', data.note]))
  return '﻿' + out.join('\r\n') + '\r\n'
}

export function downloadCsv(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
