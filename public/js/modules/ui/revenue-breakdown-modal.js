/* Workforce Allocation Dashboard — ui/revenue-breakdown-modal.js */

function renderRevenueBreakdownRows(breakdown) {
  if (!breakdown.rows.length) {
    return `
      <tr>
        <td colspan="5" class="px-4 py-10 text-center text-sm text-gray-400">
          No matching assignments were found for the visible resources.
        </td>
      </tr>
    `;
  }

  return breakdown.rows.map(row => {
    const resourceTitle = row.resources.join(', ');
    const revenueValue = row.hasCalculatedRevenue
      ? formatExactRevenueValue(row.revenue)
      : '—';
    const pricingNote = row.unpricedHours > 0
      ? `<div class="mt-1 text-[11px] text-amber-600">${row.unpricedHours.toFixed(1)} unpriced hour${row.unpricedHours === 1 ? '' : 's'}</div>`
      : '';

    return `
      <tr class="border-b border-gray-100 last:border-0">
        <td class="px-4 py-3 align-top">
          <div class="text-sm font-semibold text-gray-900">${esc(row.label)}</div>
        </td>
        <td class="px-4 py-3 align-top text-sm text-gray-600" title="${esc(resourceTitle)}">
          <div class="max-w-[260px] truncate">${esc(resourceTitle || '—')}</div>
          <div class="mt-1 text-[11px] text-gray-400">${row.resources.length} resource${row.resources.length === 1 ? '' : 's'}</div>
        </td>
        <td class="px-4 py-3 text-right align-top text-sm text-gray-600 tabular-nums">
          ${row.assignmentCount}
        </td>
        <td class="px-4 py-3 text-right align-top text-sm text-gray-700 tabular-nums">
          ${row.hours.toFixed(1)}h
          ${pricingNote}
        </td>
        <td class="px-4 py-3 text-right align-top text-sm font-semibold text-gray-900 tabular-nums">
          ${revenueValue}
        </td>
      </tr>
    `;
  }).join('');
}

function openRevenueBreakdownModal(revenueKey) {
  if (!['service', 'preSale'].includes(revenueKey)) return;

  const employees = getFilteredMatrixEmployees();
  const breakdown = getMatrixRevenueBreakdown(employees, revenueKey);
  const revenueLabel = revenueKey === 'service' ? 'Service' : 'Pre Sale';
  const subtitle = revenueKey === 'service'
    ? 'Revenue grouped by Customer Name for Intrasourcing, Local, and Training Delivery assignments.'
    : 'Revenue grouped by Product Name, with Customer Name used when Product Name is unavailable.';
  const totalValue = formatRevenueViewValue(breakdown.totalRevenue);
  const exactTotal = breakdown.totalRevenue === null
    ? '—'
    : formatExactRevenueValue(breakdown.totalRevenue);
  const unpricedNotice = breakdown.unpricedHours > 0
    ? `
      <div class="mx-5 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        ${breakdown.unpricedHours.toFixed(1)} assignment hour${breakdown.unpricedHours === 1 ? '' : 's'} could not be priced because the resource has no supported designation or saved hourly rate.
      </div>
    `
    : '';

  openModal(`
    ${mHdr(`${revenueLabel} Revenue Breakdown`, subtitle)}
    <div class="grid grid-cols-3 gap-3 px-5 pt-5">
      <div class="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
        <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Visible Resources</div>
        <div class="mt-1 text-lg font-semibold text-gray-900">${breakdown.employeeCount}</div>
      </div>
      <div class="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
        <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Assignment Hours</div>
        <div class="mt-1 text-lg font-semibold text-gray-900">${breakdown.totalHours.toFixed(1)}h</div>
      </div>
      <div class="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
        <div class="text-[11px] font-semibold uppercase tracking-wide text-blue-500">Total Revenue</div>
        <div class="mt-1 text-lg font-semibold text-blue-900" title="${esc(exactTotal)}">${totalValue}</div>
      </div>
    </div>
    ${unpricedNotice}
    <div class="p-5">
      <div class="overflow-hidden rounded-xl border border-gray-200">
        <div class="nice-scroll max-h-[55vh] overflow-auto">
          <table class="w-full border-collapse">
            <thead class="sticky top-0 z-10 bg-gray-50">
              <tr class="border-b border-gray-200">
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500">${esc(breakdown.labelHeading)}</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500">Resources</th>
                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-500">Assignments</th>
                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-500">Hours</th>
                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-500">Revenue</th>
              </tr>
            </thead>
            <tbody>${renderRevenueBreakdownRows(breakdown)}</tbody>
            <tfoot class="bg-slate-50">
              <tr class="border-t-2 border-slate-300">
                <td class="px-4 py-3 text-sm font-bold text-slate-900" colspan="3">Total</td>
                <td class="px-4 py-3 text-right text-sm font-bold text-slate-900 tabular-nums">${breakdown.totalHours.toFixed(1)}h</td>
                <td class="px-4 py-3 text-right text-sm font-bold text-slate-900 tabular-nums">${exactTotal}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
    <div class="flex justify-end rounded-b-2xl border-t border-gray-200 bg-gray-50 p-5">
      <button type="button" onclick="closeModal()" class="btn-gray">Close</button>
    </div>
  `, 'max-w-5xl');
}
