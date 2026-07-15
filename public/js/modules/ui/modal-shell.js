/* Workforce Allocation Dashboard — ui/modal-shell.js */

/* ================================================================ MODALS */
function openModal(html, width = 'max-w-lg') {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="fixed inset-0 modal-bd flex items-center justify-center z-50 p-4" id="mbd">
      <div class="modal-panel bg-white rounded-2xl shadow-2xl w-full ${width} modal-enter">${html}</div>
    </div>
  `;

  const panel = root.querySelector('.modal-panel');
  const header = panel?.firstElementChild?.classList.contains('modal-header')
    ? panel.firstElementChild
    : null;
  const footer = panel?.lastElementChild?.classList.contains('modal-footer')
    ? panel.lastElementChild
    : null;

  if (panel && header) {
    const middleChildren = [...panel.children].filter(child =>
      child !== header && child !== footer,
    );

    if (middleChildren.length) {
      const scrollBody = document.createElement('div');
      scrollBody.className = 'modal-scroll-body nice-scroll';
      panel.insertBefore(scrollBody, footer || null);
      middleChildren.forEach(child => scrollBody.appendChild(child));
    }
  }
}

function closeModal() {
  document.getElementById('modalRoot').innerHTML = '';
}

const mHdr = (title, sub) => `
  <div class="modal-header p-6 border-b border-gray-200 flex items-center justify-between gap-4">
    <div class="min-w-0">
      <h2 class="text-lg font-semibold text-gray-900">${esc(title)}</h2>
      <p class="text-sm text-gray-500 mt-0.5">${esc(sub)}</p>
    </div>
    <button onclick="closeModal()" class="p-2 hover:bg-gray-100 rounded-lg flex-shrink-0" aria-label="Close modal">
      <svg class="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 6-12 12M6 6l12 12"/></svg>
    </button>
  </div>
`;

const mFtr = (id, saveFn, delFn) => `
  <div class="modal-footer p-6 border-t border-gray-200 flex items-center justify-between gap-3 bg-gray-50 rounded-b-2xl">
    <div>${id ? `<button onclick="${delFn}(${id})" class="btn-red text-sm">Delete</button>` : ''}</div>
    <div class="flex gap-3">
      <button onclick="closeModal()" class="btn-gray">Cancel</button>
      <button onclick="${saveFn}(${id || 'null'})" class="btn-blue">${id ? 'Save Changes' : 'Create'}</button>
    </div>
  </div>
`;

/* ── View All ─────────────────────────────────────────────────── */
function openViewAllModal(type) {
  let title;
  let items;
  let listHtml;

  if (type === 'pipeline') {
    title = `All Service Pipeline FY ${SERVICE_PIPELINE_FISCAL_YEAR}`;
    items = applyPipelineFilters(getServicePipelineBaseProjects());
    listHtml = items.map(servicePipelineRowHtml).join('');
  } else {
    title = 'All Running Projects';
    items = applyRunningFilters(S.lastRunningData);
    listHtml = items.map(runningProjectRowHtml).join('');
  }

  openModal(`
    ${mHdr(title, `${items.length} item${items.length === 1 ? '' : 's'}`)}
    <div class="p-4">
      <div>${listHtml || '<div class="text-center text-gray-400 py-12">No items</div>'}</div>
    </div>
    <div class="modal-footer p-4 border-t border-gray-200 flex justify-end bg-gray-50 rounded-b-2xl">
      <button onclick="closeModal()" class="btn-gray">Close</button>
    </div>
  `, 'max-w-3xl');
}
