/* Workforce Allocation Dashboard — dashboard/sales.js */

function insightRow(e, mode = 'high', rank = 0) {
  const u = Number(e?.utilization) || 0;
  const displayU = Math.round(u);
  const clamped = Math.max(0, Math.min(u, 100));
  const status = us(u);
  const tone = u > 100 ? 'over' : u > 85 ? 'high' : u > 50 ? 'balanced' : 'available';
  const modeClass = mode === 'low' ? 'insight-resource-row--low' : 'insight-resource-row--high';
  return `<button type="button" class="insight-resource-row ${modeClass}" onclick="openEmployeeDetailModal(${Number(e.id)})" aria-label="Open ${esc(e.name)} workload details">
    <span class="insight-resource-row__rank">${rank + 1}</span>
    <span class="insight-resource-row__avatar" aria-hidden="true">${esc(inits(e.name))}</span>
    <span class="insight-resource-row__identity">
      <strong title="${esc(e.name)}">${esc(e.name)}</strong>
      <small>${esc(e.dept || '—')}</small>
    </span>
    <span class="insight-resource-row__metric">
      <span class="insight-resource-row__metric-top">
        <span class="insight-resource-row__status insight-resource-row__status--${tone}">${esc(status)}</span>
        <strong class="insight-resource-row__percent insight-resource-row__percent--${tone}">${displayU}%</strong>
      </span>
      <span class="insight-resource-row__progress" aria-hidden="true"><span class="insight-resource-row__progress-fill insight-resource-row__progress-fill--${tone}" style="width:${clamped}%"></span></span>
    </span>
  </button>`;
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
  const n = String(pn || '').trim().replace(/\s+/g, ' ').toUpperCase();
  const compactName = n.replace(/[^A-Z0-9]/g, '');
  const f = String(pf || '').trim().replace(/\s+/g, ' ').toUpperCase();
  const isPsSupport = compactName.includes('PSSYSTEMSUPPORT');
  const isPsImplementation = [
    'PSPROJECTIMPLEMENTATION',
    'PSPROJECTIMPLEMENT',
    'PSPROJECTIMPLEMETATION',
    'PSPROJECTIMPLEMENTAION',
  ].some(variant => compactName.includes(variant));

  // Product Name is the sole source of truth for PS Only. Product Family does
  // not qualify a record, and Opportunity Number is never used for matching.
  if (isPsSupport || isPsImplementation) return 'PS';
  if (n.includes('PERSONAL USE')) return 'PERSONAL';
  if (n.includes('STUDENT USE')) return 'STUDENT';
  if (n.includes('LICENSE') || n.includes('RENEW') || n.includes('SUBSCRIPTION')) return 'SUBSCRIPTION';
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
  const countUnit = fyData?.count_unit === 'projects' ? 'projects' : 'accounts';
  const singularUnit = countUnit === 'projects' ? 'project' : 'account';

  const rowHtml = (p) => {
    const name = typeof p === 'string' ? p : (p.name || '');
    const projectId = typeof p === 'object' && Number.isFinite(Number(p.id)) ? Number(p.id) : null;
    const saCode = typeof p === 'object' && p.code ? p.code : '';
    const oppName = typeof p === 'object' && p.opp_name ? p.opp_name : '';
    const prodName = typeof p === 'object' ? (p.product_name || '') : '';
    const prodFam = typeof p === 'object' ? (p.product_family || '') : '';
    // Project ID is the only lookup key. Opportunity Number is not unique and
    // must never be used to resolve a drill-down row.
    const proj = projectId ? S.projects.find(x => Number(x.id) === projectId) : null;
    const projId = proj ? Number(proj.id) : projectId;
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
      + '<span class="text-xs text-gray-400">0 ' + countUnit + '</span></div></div>';
    return '<div class="mb-5">'
      + '<div class="flex items-center gap-2 mb-2">'
      + '<span class="px-2 py-0.5 rounded-full text-xs font-semibold ' + badgeCls + '">' + icon + ' ' + status + '</span>'
      + '<span class="text-xs text-gray-400">' + list.length + ' ' + singularUnit + (list.length === 1 ? '' : 's') + '</span>'
      + '</div>'
      + '<div class="space-y-1.5">' + list.map(rowHtml).join('') + '</div>'
      + '</div>';
  };

  const breakdownSubtitle = countUnit === 'projects'
    ? 'Qualifying PS projects \u00b7 click a row to open project details'
    : 'Unique accounts \u00b7 click a row to open project details';

  openModal(mHdr(label + ' \u2014 Deal Breakdown', breakdownSubtitle)
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


