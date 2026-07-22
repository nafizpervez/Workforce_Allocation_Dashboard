/* Workforce Allocation Dashboard — imports/assignments.js */

function assignmentMonthLabel(year, month) {
  const y = Number(year);
  const m = Number(month);
  return y && m >= 1 && m <= 12 ? `${MN[m - 1]} ${y}` : '';
}

function downloadAssignmentExcel() {
  try {
    if (typeof XLSX === 'undefined') {
      toast('Excel library is not loaded. Please check SheetJS CDN access.', 'error');
      return;
    }

    const activeEmployeeIds = getActiveEmployeeIdSet();
    const rows = (S.matrixAssignments || [])
      .filter(a => activeEmployeeIds.has(Number(a.employee_id)))
      .sort((a, b) => {
        const ea = (S.employees || []).find(e => e.id === a.employee_id)?.name || '';
        const eb = (S.employees || []).find(e => e.id === b.employee_id)?.name || '';
        if (ea !== eb) return ea.localeCompare(eb);
        if (a.year !== b.year) return a.year - b.year;
        if (a.month !== b.month) return a.month - b.month;
        if (a.week !== b.week) return a.week - b.week;
        const pa = (S.projects || []).find(p => p.id === a.project_id)?.name || '';
        const pb = (S.projects || []).find(p => p.id === b.project_id)?.name || '';
        return pa.localeCompare(pb);
      })
      .map((a, idx) => {
        const emp = (S.employees || []).find(e => e.id === a.employee_id) || {};
        const project = (S.projects || []).find(p => p.id === a.project_id) || {};
        const projectListPosition = Math.max(0, (S.projects || []).findIndex(p => p.id === a.project_id)) + 1;
        const range = weekDateRange(a.year, a.month, a.week);
        const productAmount = Number(project.product_amount || 0);

        return {
          'SL': idx + 1,
          'Fiscal Year': `FY ${S.matrixFiscalYear + 1}`,
          'Assignment ID': a.id || '',
          'Old Employee ID': a.employee_id || '',
          'Resource ID': emp.employee_code || '',
          'Resource Name': emp.name || '',
          'Department': emp.dept || '',
          'Resource Email': emp.email || '',
          'Old Project ID': a.project_id || '',
          'Project Import Row No': project.import_row_no || '',
          'Project List Position': projectListPosition || '',
          'Opportunity Number': project.code || a.project_code || '',
          'Project Name': project.name || a.project_name || '',
          'Customer Name': project.account_name || project.client || a.account_name || '',
          'Product Name': project.product_name || '',
          'Product Family': project.product_family || '',
          'Product Amount': productAmount,
          'Stage': project.stage || '',
          'Year': Number(a.year) || '',
          'Month Number': Number(a.month) || '',
          'Month Label': assignmentMonthLabel(a.year, a.month),
          'Week': Number(a.week) || '',
          'Start Date': range.start,
          'End Date': range.end,
          'Allocation %': Number(a.percentage) || 0,
        };
      });

    if (!rows.length) {
      toast('No assignment rows found to export for the current fiscal year.', 'info');
      return;
    }

    const summaryRows = [
      { 'Metric': 'Export Date', 'Value': new Date().toLocaleString() },
      { 'Metric': 'Fiscal Year', 'Value': `FY ${S.matrixFiscalYear + 1}` },
      { 'Metric': 'Assignment Rows', 'Value': rows.length },
      { 'Metric': 'Restore Key - Employee', 'Value': 'Resource ID, then Resource Name' },
      { 'Metric': 'Restore Key - Project', 'Value': 'Project Import Row No / Old Project ID first, then Opportunity Number, Project Name, Product Name, and Product Amount fallback. Duplicates are allowed.' },
      { 'Metric': 'Import Behavior', 'Value': 'Bulk Assign Assignment replaces the current fiscal-year assignments before inserting these rows.' },
    ];

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    const wsAssignments = XLSX.utils.json_to_sheet(rows);

    wsAssignments['!cols'] = [
      { wch: 6 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 14 },
      { wch: 26 }, { wch: 22 }, { wch: 28 }, { wch: 14 }, { wch: 18 },
      { wch: 36 }, { wch: 28 }, { wch: 34 }, { wch: 24 }, { wch: 14 },
      { wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 8 },
      { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 44 },
    ];

    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
    XLSX.utils.book_append_sheet(wb, wsAssignments, 'Assignments');

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    XLSX.writeFile(wb, `allocation_dashboard_assignments_${stamp}.xlsx`);
    toast(`Exported ${rows.length} assignment row${rows.length === 1 ? '' : 's'}`);
  } catch (e) {
    console.error(e);
    toast('Failed to download assignment Excel', 'error');
  }
}

window.downloadAssignmentExcel = downloadAssignmentExcel;

function parseAssignmentExcelRows(sheetRows) {
  return (sheetRows || []).map((row, idx) => {
    const employeeCode = String(getProjectImportCellValue(row, [
      'Resource ID', 'Employee Code', 'Res ID', 'Resource Code'
    ]) || '').trim();

    const employeeName = String(getProjectImportCellValue(row, [
      'Resource Name', 'Employee Name', 'Resource', 'Worker'
    ]) || '').trim();

    const projectCode = String(getProjectImportCellValue(row, [
      'Opportunity Number', 'Project Code', 'SA Number', 'SA No', 'Code'
    ]) || '').trim().toUpperCase();

    const projectName = String(getProjectImportCellValue(row, [
      'Project Name', 'Opportunity Name', 'Name'
    ]) || '').trim();

    const productName = String(getProjectImportCellValue(row, [
      'Product Name', 'Product Description', 'Product Desc', 'Item Description'
    ]) || '').trim();

    const productAmount = normalizeProjectImportNumber(
      getProjectImportCellValue(row, ['Product Amount', 'ProductAmount'])
    );

    const oldProjectId = Math.trunc(normalizeProjectImportNumber(
      getProjectImportCellValue(row, ['Old Project ID', 'Project ID'])
    ));

    const projectImportRowNo = Math.trunc(normalizeProjectImportNumber(
      getProjectImportCellValue(row, ['Project Import Row No', 'Project Source Row', 'Excel Row'])
    ));

    const projectListPosition = Math.trunc(normalizeProjectImportNumber(
      getProjectImportCellValue(row, ['Project List Position', 'Project Row No'])
    ));

    let year = Math.trunc(normalizeProjectImportNumber(
      getProjectImportCellValue(row, ['Year'])
    ));

    let month = Math.trunc(normalizeProjectImportNumber(
      getProjectImportCellValue(row, ['Month Number', 'Month', 'Month No'])
    ));

    let week = Math.trunc(normalizeProjectImportNumber(
      getProjectImportCellValue(row, ['Week', 'Week Number'])
    ));

    const startDateRaw = getProjectImportCellValue(row, ['Start Date', 'Assignment Start Date']);
    const startDate = normalizeProjectImportDate(startDateRaw);

    if ((!year || !month || !week) && startDate) {
      const d = parseDateInputLocal(startDate);
      if (d) {
        const slot = getMatrixSlotFromDate(d);
        year = slot.year;
        month = slot.month;
        week = slot.week;
      }
    }

    const percentage = normalizeProjectImportNumber(
      getProjectImportCellValue(row, [
        'Allocation %', 'Allocation', 'Percentage', 'Workload Allocation', 'Workload %'
      ])
    );

    return {
      source_row: idx + 2,
      employee_code: employeeCode,
      employee_name: employeeName,
      old_project_id: oldProjectId,
      project_import_row_no: projectImportRowNo,
      project_list_position: projectListPosition,
      project_code: projectCode,
      project_name: projectName,
      product_name: productName,
      product_amount: productAmount,
      year,
      month,
      week,
      percentage,
    };
  }).filter(r => (
    (r.employee_code || r.employee_name) &&
    (r.project_code || r.project_name) &&
    r.year &&
    r.month &&
    r.week
  ));
}

function openAssignmentImportResultModal(result, fileName) {
  const imported = result.imported || [];
  const skipped = result.skipped || [];
  const failed = result.failed || [];

  const row = (r, badgeCls, badgeText) => `
    <div class="flex items-start justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
      <div class="min-w-0">
        <div class="text-xs font-bold text-blue-600 mono">${esc(r.project_code || r['Opportunity Number'] || '—')}</div>
        <div class="text-sm font-semibold text-gray-900 truncate">${esc(r.project_name || r['Project Name'] || '—')}</div>
        <div class="text-xs text-gray-500 mt-0.5 truncate">
          ${esc(r.employee_name || r.employee_code || '—')}
          ${r.year && r.month && r.week ? ` · ${assignmentMonthLabel(r.year, r.month)} W${r.week}` : ''}
          ${r.percentage !== undefined ? ` · ${Number(r.percentage || 0)}%` : ''}
        </div>
        ${r.reason ? `<div class="text-xs text-gray-500 mt-0.5">${esc(r.reason)}</div>` : ''}
        ${r.error ? `<div class="text-xs text-red-500 mt-0.5">${esc(r.error)}</div>` : ''}
      </div>
      <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${badgeCls} flex-shrink-0">${badgeText}</span>
    </div>`;

  openModal(
    mHdr(
      'Bulk Assignment Import Completed',
      `${fileName || 'Uploaded Excel'} · ${result.received_rows || 0} rows read · existing FY assignments replaced before insert`
    )
    + `<div class="p-6 overflow-y-auto nice-scroll" style="max-height:65vh">
        <div class="grid grid-cols-4 gap-3 mb-5">
          <div class="rounded-xl bg-blue-50 border border-blue-100 p-4 text-center">
            <div class="text-2xl font-bold text-blue-700">${result.deleted_count || 0}</div>
            <div class="text-xs text-blue-700 mt-1">Deleted Old Rows</div>
          </div>
          <div class="rounded-xl bg-emerald-50 border border-emerald-100 p-4 text-center">
            <div class="text-2xl font-bold text-emerald-700">${result.imported_count || 0}</div>
            <div class="text-xs text-emerald-700 mt-1">Imported Rows</div>
          </div>
          <div class="rounded-xl bg-gray-50 border border-gray-100 p-4 text-center">
            <div class="text-2xl font-bold text-gray-700">${result.skipped_count || 0}</div>
            <div class="text-xs text-gray-500 mt-1">Skipped Rows</div>
          </div>
          <div class="rounded-xl bg-red-50 border border-red-100 p-4 text-center">
            <div class="text-2xl font-bold text-red-700">${result.failed_count || 0}</div>
            <div class="text-xs text-red-600 mt-1">Failed Rows</div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <div class="text-sm font-semibold text-gray-700 mb-2">Imported Assignment Rows</div>
            <div class="rounded-xl border border-gray-100 bg-white max-h-72 overflow-y-auto nice-scroll px-3">
              ${imported.slice(0, 120).map(r => row(r, 'bg-emerald-100 text-emerald-700', 'Imported')).join('') || '<p class="text-sm text-gray-400 text-center py-6">No assignment rows imported.</p>'}
            </div>
          </div>
          <div>
            <div class="text-sm font-semibold text-gray-700 mb-2">Skipped / Failed Rows</div>
            <div class="rounded-xl border border-gray-100 bg-white max-h-72 overflow-y-auto nice-scroll px-3">
              ${skipped.slice(0, 120).map(r => row(r, 'bg-gray-100 text-gray-600', 'Skipped')).join('')}
              ${failed.slice(0, 80).map(r => row(r, 'bg-red-100 text-red-700', 'Failed')).join('')}
              ${!failed.length ? '<p class="text-sm text-gray-400 text-center py-6">No failed rows.</p>' : ''}
            </div>
          </div>
        </div>
      </div>
      <div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50 rounded-b-2xl">
        <button onclick="closeModal()" class="btn-gray">Close</button>
      </div>`,
    'max-w-5xl'
  );
}

async function handleAssignmentExcelUpload(file) {
  if (!file) return;

  if (typeof XLSX === 'undefined') {
    toast('Excel parser is not loaded. Check SheetJS CDN.', 'error');
    return;
  }

  try {
    const buf = await file.arrayBuffer();
    const workbook = XLSX.read(buf, { type: 'array', cellDates: false });
    const sheetName =
      workbook.SheetNames.find(n => n.trim().toLowerCase() === 'assignments') ||
      workbook.SheetNames[0];

    const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      defval: '',
      raw: false,
    });

    const rows = parseAssignmentExcelRows(sheetRows);

    if (!rows.length) {
      toast('No valid assignment rows found. Required: Resource ID/Name, Opportunity Number/Project Name, Year/Month/Week, Allocation %.', 'error');
      return;
    }

    const ok = confirm(
      `Bulk Assign Assignment will replace all current FY ${S.matrixFiscalYear + 1} assignment rows, then import ${rows.length} row${rows.length === 1 ? '' : 's'} from this Excel. Continue?`
    );

    if (!ok) return;

    const result = await api('POST', '/api/assignments/import', {
      fiscalYear: S.matrixFiscalYear,
      replaceFiscalYear: true,
      rows,
    });

    await loadAll();

    toast(`Imported ${result.imported_count || 0} assignment row${(result.imported_count || 0) === 1 ? '' : 's'}`);
    openAssignmentImportResultModal(result, file.name);
  } catch (e) {
    console.error(e);
    toast('Failed to bulk import assignments from Excel', 'error');
  }
}

