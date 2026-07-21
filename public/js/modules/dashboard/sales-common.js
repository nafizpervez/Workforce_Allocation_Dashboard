/* Workforce Allocation Dashboard — dashboard/sales.js */

function insightRow(e) {
  const u = e.utilization;
  const displayU = Math.round(Number(u) || 0);
  const clr = uc(u), badge = ub(u), label = us(u);
  return `<div class="flex items-center gap-4 p-3 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer" onclick="openEmployeeDetailModal(${e.id})">
    <div class="relative flex-shrink-0"><div class="w-10 h-10 avatar-grad rounded-full flex items-center justify-center text-sm">${esc(inits(e.name))}</div><div class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${u === 0 ? 'bg-emerald-400' : u >= 80 ? 'bg-red-400' : 'bg-amber-400'}"></div></div>
    <div class="flex-1 min-w-0"><div class="text-sm font-semibold text-gray-900 truncate">${esc(e.name)}</div><div class="text-xs text-gray-500">${esc(e.dept || '—')}</div></div>
    <div class="flex items-center gap-2 flex-shrink-0"><span class="${badge} text-xs px-2 py-0.5 rounded-full font-medium">${label}</span><span class="text-sm font-bold ${clr}">${displayU}%</span></div>
  </div>`;
}

/* ── Deal status badge ────────────────────────────────────────── */
function dealStatusBadge(status) {
  if (!status) return '';
  const map = {
    'NEW LOGO': { cls: 'bg-emerald-100 text-emerald-700', icon: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>' },
    'REPEAT': { cls: 'bg-blue-100 text-blue-700', icon: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>' },
    'REACTIVE': { cls: 'bg-amber-100 text-amber-700', icon: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>' },
  };
  const s = map[status] || map['NEW LOGO'];
  return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${s.cls} flex-shrink-0"><svg class="w-2.5 h-2.5 flex-shrink-0" viewBox="0 0 24 24" fill="${status === 'NEW LOGO' ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${s.icon}</svg>${status}</span>`;
}

/* ================================================================ PRODUCT CATEGORY FILTER (Deal Acquisition Chart) */

/**
 * Classifies a project into a product bucket based on product_name and product_family.
 * Priority order: PS > Personal Use > Student Use > Subscription > Software > OTHER
 */
function classifyProduct(pn, pf) {
  const n = (pn || '').toUpperCase();
  const f = (pf || '').toUpperCase();
  // PS Only: PS System Support or PS Project Implementation (covers typo variant)
  if (n.includes('PS SYSTEM SUPPORT') || n.includes('PS PROJECT IMPLEMENT')) return 'PS';
  // Personal Use
  if (n.includes('ARCGIS FOR PERSONAL USE ONE YEAR ANNUAL SUBSCRIPTION')) return 'PERSONAL';
  // Student Use
  if (n.includes('ARCGIS FOR STUDENT USE ONE YEAR TIMEOUT LICENSE')) return 'STUDENT';
  // Subscription: has license/renew/subscription keywords but not caught above
  if (n.includes('LICENSE') || n.includes('RENEW') || n.includes('SUBSCRIPTION')) return 'SUBSCRIPTION';
  // Software: product_family is Software
  if (f === 'SOFTWARE') return 'SOFTWARE';
  return 'OTHER';
}

/**
 * Returns a filtered copy of a single FY chart entry,
 * keeping only projects matching the given product filter bucket.
 * When prodFilter is 'ALL', returns the entry unchanged.
 */


/* ── Deal breakdown modal ─────────────────────────────────────── */
function openDealModal(fyData) {
  const { label, projects } = fyData;

  const rowHtml = (p) => {
    const name = typeof p === 'string' ? p : (p.name || '');
    const saCode = typeof p === 'object' && p.code ? p.code : '';
    const oppName = typeof p === 'object' && p.opp_name ? p.opp_name : '';
    const prodName = typeof p === 'object' ? (p.product_name || '') : '';
    const prodFam = typeof p === 'object' ? (p.product_family || '') : '';
    const proj = saCode ? S.projects.find(x => x.code === saCode) : null;
    const projId = proj ? proj.id : null;
    const clickable = projId ? 'cursor-pointer deal-modal-row hover:bg-blue-50 hover:border-blue-200' : '';
    const dataAttr = projId ? ('data-proj-id="' + projId + '"') : '';
    const sub = [prodName, prodFam].filter(Boolean).join(' · ');
    return '<div class="py-2 px-3 bg-gray-50 rounded-lg border border-gray-100 transition-colors ' + clickable + '" ' + dataAttr + '>'
      + '<div class="flex items-start justify-between gap-2">'
      + '<div class="min-w-0 flex-1">'
      + '<div class="text-sm font-semibold text-gray-900 leading-snug">' + esc(name) + '</div>'
      + (oppName ? '<div class="text-xs text-gray-600 mt-0.5 truncate">' + esc(oppName) + '</div>' : '')
      + (sub ? '<div class="text-xs text-gray-400 mt-0.5">' + esc(sub) + '</div>' : '')
      + '</div>'
      + (saCode ? '<span class="text-xs font-bold text-blue-600 mono flex-shrink-0 mt-0.5">' + esc(saCode) + '</span>' : '')
      + '</div></div>';
  };

  const section = (status, badgeCls, icon) => {
    const list = projects[status] || [];
    if (!list.length) return '<div class="mb-4"><div class="flex items-center gap-2 mb-1.5">'
      + '<span class="px-2 py-0.5 rounded-full text-xs font-semibold ' + badgeCls + '">' + icon + ' ' + status + '</span>'
      + '<span class="text-xs text-gray-400">0 accounts</span></div></div>';
    return '<div class="mb-5">'
      + '<div class="flex items-center gap-2 mb-2">'
      + '<span class="px-2 py-0.5 rounded-full text-xs font-semibold ' + badgeCls + '">' + icon + ' ' + status + '</span>'
      + '<span class="text-xs text-gray-400">' + list.length + ' account' + (list.length === 1 ? '' : 's') + '</span>'
      + '</div>'
      + '<div class="space-y-1.5">' + list.map(rowHtml).join('') + '</div>'
      + '</div>';
  };

  openModal(mHdr(label + ' \u2014 Deal Breakdown', 'Unique accounts \u00b7 click a row to open project details')
    + '<div class="p-6 overflow-y-auto nice-scroll" style="max-height:65vh">'
    + section('NEW LOGO', 'bg-emerald-100 text-emerald-700', '\u2b50')
    + section('REPEAT', 'bg-blue-100 text-blue-700', '\u21ba')
    + section('REACTIVE', 'bg-amber-100 text-amber-700', '\u26a1')
    + '</div>'
    + '<div class="px-6 py-4 border-t border-gray-100 flex justify-end bg-gray-50 rounded-b-2xl">'
    + '<button onclick="closeModal()" class="btn-gray">Close</button>'
    + '</div>', 'max-w-xl');

  // Wire up click-to-open-project
  document.querySelectorAll('#modalRoot .deal-modal-row[data-proj-id]').forEach(el => {
    el.addEventListener('click', () => {
      closeModal();
      openProjectModal({ id: +el.dataset.projId });
    });
  });
}


