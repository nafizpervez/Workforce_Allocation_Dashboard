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
      'Opportunity Number', 'Opportunity No', 'Opportunity #', 'SA Number', 'SA No', 'Code'
    ]) || '').trim().toUpperCase();

    const name = String(getProjectImportCellValue(row, [
      'Opportunity Name', 'Project Name', 'Name'
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
        'Item Description'
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

function openProjectImportResultModal(result, fileName) {
  const inserted = result.inserted || [];
  const skipped = result.skipped_existing || [];
  const failed = result.failed || [];
  const isReplaceMode = result.mode === 'replace_all_projects';

  const row = (p, badgeCls, badgeText) => `
    <div class="flex items-start justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
      <div class="min-w-0">
        <div class="text-xs font-bold text-blue-600 mono">${esc(p.code || '—')}</div>
        <div class="text-sm font-semibold text-gray-900 truncate">${esc(p.name || '—')}</div>
        ${(p.product_name || p.product_amount !== undefined) ? `<div class="text-xs text-gray-500 mt-0.5 truncate">${esc(p.product_name || '—')} · ${Number(p.product_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD${p.fiscal_period ? ' · ' + esc(p.fiscal_period) : ''}</div>` : ''}
        ${p.reason ? `<div class="text-xs text-gray-500 mt-0.5">${esc(p.reason)}</div>` : ''}
        ${p.error ? `<div class="text-xs text-red-500 mt-0.5">${esc(p.error)}</div>` : ''}
      </div>
      <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${badgeCls} flex-shrink-0">${badgeText}</span>
    </div>`;

  openModal(
    mHdr(
      isReplaceMode ? 'Project Excel Replacement Completed' : 'Project Excel Import Completed',
      `${fileName || 'Uploaded Excel'} · ${(result.project_rows_ready ?? result.normalized_projects) || 0} valid project row${(((result.project_rows_ready ?? result.normalized_projects) || 0) === 1) ? '' : 's'} inserted as provided; duplicates kept`
    )
    + `<div class="p-6 overflow-y-auto nice-scroll" style="max-height:65vh">
        ${isReplaceMode ? `
          <div class="rounded-xl bg-amber-50 border border-amber-100 p-3 mb-5 text-xs text-amber-800 leading-relaxed">
            Existing project data was fully replaced from this Excel. Existing assignment rows were deleted because they referenced old project IDs. Use <span class="font-semibold">Bulk Assign Assignment</span> to restore assignment data from your assignment backup Excel. Duplicate project rows from Excel are kept.
          </div>` : ''}

        <div class="grid grid-cols-4 gap-3 mb-5">
          <div class="rounded-xl bg-slate-50 border border-slate-100 p-4 text-center">
            <div class="text-2xl font-bold text-slate-700">${result.deleted_project_count || 0}</div>
            <div class="text-xs text-slate-500 mt-1">Deleted Projects</div>
          </div>
          <div class="rounded-xl bg-orange-50 border border-orange-100 p-4 text-center">
            <div class="text-2xl font-bold text-orange-700">${result.deleted_assignment_count || 0}</div>
            <div class="text-xs text-orange-600 mt-1">Deleted Assignments</div>
          </div>
          <div class="rounded-xl bg-emerald-50 border border-emerald-100 p-4 text-center">
            <div class="text-2xl font-bold text-emerald-700">${result.inserted_count || 0}</div>
            <div class="text-xs text-emerald-700 mt-1">Inserted Projects</div>
          </div>
          <div class="rounded-xl bg-red-50 border border-red-100 p-4 text-center">
            <div class="text-2xl font-bold text-red-700">${result.failed_count || 0}</div>
            <div class="text-xs text-red-600 mt-1">Failed</div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <div class="text-sm font-semibold text-gray-700 mb-2">Inserted / Replaced Projects</div>
            <div class="rounded-xl border border-gray-100 bg-white max-h-72 overflow-y-auto nice-scroll px-3">
              ${inserted.length ? inserted.map(p => row(p, 'bg-emerald-100 text-emerald-700', 'Inserted')).join('') : '<p class="text-sm text-gray-400 text-center py-6">No projects inserted.</p>'}
            </div>
          </div>
          <div>
            <div class="text-sm font-semibold text-gray-700 mb-2">Failed Rows</div>
            <div class="rounded-xl border border-gray-100 bg-white max-h-72 overflow-y-auto nice-scroll px-3">
              
              ${failed.map(p => row(p, 'bg-red-100 text-red-700', 'Failed')).join('')}
              ${!failed.length ? '<p class="text-sm text-gray-400 text-center py-6">No failed rows.</p>' : ''}
            </div>
          </div>
        </div>
      </div>
      <div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50 rounded-b-2xl">
        <button onclick="openProjectsModal()" class="btn-blue">View Projects</button>
        <button onclick="closeModal()" class="btn-gray">Close</button>
      </div>`,
    'max-w-4xl'
  );
}

async function handleProjectExcelUpload(file) {
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

    const result = await api('POST', '/api/projects/import', { rows });

    await loadAll();

    toast(`Replaced project list with ${result.inserted_count || 0} project${(result.inserted_count || 0) === 1 ? '' : 's'}`);
    openProjectImportResultModal(result, file.name);
  } catch (e) {
    console.error(e);
    toast('Failed to import projects from Excel', 'error');
  }
}



