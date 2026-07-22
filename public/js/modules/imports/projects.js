/* Workforce Allocation Dashboard — imports/projects.js */

function getProjectImportCellValue(row, names) {
  const wanted = names.map(n => String(n).toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (const [key, value] of Object.entries(row || {})) {
    const normalizedKey = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (wanted.includes(normalizedKey)) return value;
  }
  return '';
}

function normalizeProjectImportDate(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';

  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3];
    if (y && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    let mo = +m[1], d = +m[2], y = +m[3];
    if (y < 100) y += 2000;
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  const dObj = new Date(s);
  if (!isNaN(dObj)) return dObj.toISOString().slice(0, 10);
  return '';
}

function normalizeProjectImportNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function parseProjectExcelRows(sheetRows) {
  return (sheetRows || []).map((row, idx) => {
    const code = String(getProjectImportCellValue(row, [
      'Opportunity Number', 'Opportunity No', 'Opportunity #', 'SA Number', 'SA No', 'Code',
    ]) || '').trim().toUpperCase();

    const name = String(getProjectImportCellValue(row, [
      'Opportunity Name', 'Project Name', 'Name',
    ]) || '').trim();

    return {
      source_row: idx + 2,
      code,
      name,
      account_name: String(getProjectImportCellValue(row, ['Account Name', 'Customer Name', 'Client']) || '').trim(),
      opportunity_owner: String(getProjectImportCellValue(row, ['Opportunity Owner', 'Owner']) || '').trim(),
      probability: normalizeProjectImportNumber(getProjectImportCellValue(row, ['Probability (%)', 'Probability', 'Probability %'])),
      product_family: String(getProjectImportCellValue(row, ['Product Family']) || '').trim(),
      product_name: String(getProjectImportCellValue(row, [
        'Product Name',
        'Product Description',
        'Product Desc',
        'Product Detail',
        'Item Description',
      ]) || '').trim(),
      stage: String(getProjectImportCellValue(row, ['Stage']) || '').trim(),
      fiscal_period: String(getProjectImportCellValue(row, ['Fiscal Period', 'Fiscal Year', 'Fiscal Quarter']) || '').trim(),
      close_date: normalizeProjectImportDate(getProjectImportCellValue(row, ['Close Date', 'Closed Won Date', 'Close Won Date'])),
      created_date: normalizeProjectImportDate(getProjectImportCellValue(row, ['Created Date'])),
      product_amount: normalizeProjectImportNumber(getProjectImportCellValue(row, ['Product Amount'])),
      amount: normalizeProjectImportNumber(getProjectImportCellValue(row, ['Amount', 'Opportunity Amount'])),
    };
  }).filter(r => r.code && r.name);
}

function projectImportModeLabel(mode) {
  return mode === 'historical' ? 'Historical Projects' : 'Forecasted Projects';
}

function openProjectImportResultModal(result, fileName) {
  const inserted = result.inserted || [];
  const updated = result.updated || [];
  const deleted = result.deleted_unassigned || [];
  const retained = result.retained_assigned || [];
  const excluded = result.excluded || [];
  const failed = result.failed || [];

  const row = (project, badgeCls, badgeText) => `
    <div class="flex items-start justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
      <div class="min-w-0">
        <div class="text-xs font-bold text-blue-600 mono">${esc(project.code || '—')}</div>
        <div class="text-sm font-semibold text-gray-900 truncate">${esc(project.name || '—')}</div>
        ${(project.product_name || project.product_amount !== undefined) ? `<div class="text-xs text-gray-500 mt-0.5 truncate">${esc(project.product_name || '—')} · ${Number(project.product_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD${project.fiscal_period ? ' · ' + esc(project.fiscal_period) : ''}</div>` : ''}
        ${project.previous_code && project.previous_code !== project.code ? `<div class="text-xs text-indigo-600 mt-0.5">Opportunity Number updated from ${esc(project.previous_code)}</div>` : ''}
        ${project.assignment_count ? `<div class="text-xs text-amber-700 mt-0.5">${project.assignment_count} assignment${project.assignment_count === 1 ? '' : 's'} preserved</div>` : ''}
        ${project.reason ? `<div class="text-xs text-gray-500 mt-0.5">${esc(project.reason)}</div>` : ''}
        ${project.error ? `<div class="text-xs text-red-500 mt-0.5">${esc(project.error)}</div>` : ''}
      </div>
      <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${badgeCls} flex-shrink-0">${badgeText}</span>
    </div>`;

  const list = (title, rows, badgeCls, badgeText, emptyText) => `
    <section>
      <div class="text-sm font-semibold text-gray-700 mb-2">${esc(title)}</div>
      <div class="rounded-xl border border-gray-100 bg-white max-h-64 overflow-y-auto nice-scroll px-3">
        ${rows.length ? rows.map(project => row(project, badgeCls, badgeText)).join('') : `<p class="text-sm text-gray-400 text-center py-6">${esc(emptyText)}</p>`}
      </div>
    </section>`;

  openModal(
    mHdr(
      `${projectImportModeLabel(result.import_mode)} Import Completed`,
      `${fileName || 'Uploaded Excel'} · ${result.partition_label || ''}`,
    )
    + `<div class="p-6 overflow-y-auto nice-scroll" style="max-height:68vh">
        <div class="rounded-xl bg-blue-50 border border-blue-100 p-3 mb-5 text-xs text-blue-800 leading-relaxed">
          Only the selected fiscal-year partition was refreshed. Matching projects were updated in place, so project IDs and assignment relationships were preserved. No assignments were deleted.
        </div>

        <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
          <div class="rounded-xl bg-emerald-50 border border-emerald-100 p-4 text-center">
            <div class="text-2xl font-bold text-emerald-700">${result.inserted_count || 0}</div>
            <div class="text-xs text-emerald-700 mt-1">Inserted</div>
          </div>
          <div class="rounded-xl bg-indigo-50 border border-indigo-100 p-4 text-center">
            <div class="text-2xl font-bold text-indigo-700">${result.updated_existing_count || 0}</div>
            <div class="text-xs text-indigo-700 mt-1">Updated</div>
          </div>
          <div class="rounded-xl bg-slate-50 border border-slate-100 p-4 text-center">
            <div class="text-2xl font-bold text-slate-700">${result.deleted_project_count || 0}</div>
            <div class="text-xs text-slate-600 mt-1">Removed Unassigned</div>
          </div>
          <div class="rounded-xl bg-amber-50 border border-amber-100 p-4 text-center">
            <div class="text-2xl font-bold text-amber-700">${result.retained_assigned_count || 0}</div>
            <div class="text-xs text-amber-700 mt-1">Retained Assigned</div>
          </div>
          <div class="rounded-xl bg-gray-50 border border-gray-100 p-4 text-center">
            <div class="text-2xl font-bold text-gray-700">${result.excluded_count || 0}</div>
            <div class="text-xs text-gray-600 mt-1">Outside Partition</div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          ${list('Inserted Projects', inserted, 'bg-emerald-100 text-emerald-700', 'Inserted', 'No projects inserted.')}
          ${list('Updated Existing Projects', updated, 'bg-indigo-100 text-indigo-700', 'Updated', 'No existing projects updated.')}
          ${list('Retained Assigned Projects', retained, 'bg-amber-100 text-amber-700', 'Retained', 'No unmatched assigned projects required retention.')}
          ${list('Removed Unassigned Projects', deleted, 'bg-slate-100 text-slate-700', 'Removed', 'No unmatched unassigned projects removed.')}
          ${list('Rows Outside Selected Partition', excluded, 'bg-gray-100 text-gray-700', 'Skipped', 'No rows were outside the selected partition.')}
          ${list('Failed Rows', failed, 'bg-red-100 text-red-700', 'Failed', 'No failed rows.')}
        </div>
      </div>
      <div class="modal-footer px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50 rounded-b-2xl">
        <button onclick="openProjectsModal()" class="btn-blue">View Projects</button>
        <button onclick="closeModal()" class="btn-gray">Close</button>
      </div>`,
    'max-w-5xl',
  );
}

async function handleProjectExcelUpload(file, mode = 'forecast') {
  if (!file) return;

  if (typeof XLSX === 'undefined') {
    toast('Excel parser is not loaded. Check SheetJS CDN.', 'error');
    return;
  }

  try {
    const buf = await file.arrayBuffer();
    const workbook = XLSX.read(buf, { type: 'array', cellDates: false });
    const sheetName = workbook.SheetNames[0];
    const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      defval: '',
      raw: false,
    });

    const rows = parseProjectExcelRows(sheetRows);

    if (!rows.length) {
      toast('No valid project rows found. Required: Opportunity Number and Opportunity Name.', 'error');
      return;
    }

    const result = await api('POST', '/api/projects/import', { rows, mode });
    await loadAll();

    const changedCount = (result.inserted_count || 0) + (result.updated_existing_count || 0);
    toast(`${projectImportModeLabel(mode)} import updated ${changedCount} project${changedCount === 1 ? '' : 's'}`);
    openProjectImportResultModal(result, file.name);
  } catch (error) {
    console.error(error);
    toast(error.message || 'Failed to import projects from Excel', 'error');
  }
}
