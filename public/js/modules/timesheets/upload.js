/* Workforce Allocation Dashboard — timesheets/upload.js */

async function handleTimesheetUpload(file) {
  if (!file) return;

  if (typeof XLSX === 'undefined') {
    toast('Excel parser is not loaded. Check internet/CDN access for SheetJS.', 'error');
    return;
  }

  try {
    const buf = await file.arrayBuffer();

    const workbook = XLSX.read(buf, {
      type: 'array',
      cellDates: false,
    });

    const sheetName =
      workbook.SheetNames.find(n => n.trim().toLowerCase() === 'time sheet') ||
      workbook.SheetNames[0];

    const parsedRows = normalizeTimesheetRows(
      XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        defval: '',
        raw: false,
      })
    );

    const rows = aggregateTimesheetRows(parsedRows);

    if (!rows.length) {
      toast(
        'No valid Time Sheet rows found. Required columns: Month, Work Type, Worker, Qty (Hrs).',
        'error'
      );
      return;
    }

    const saved = await api('POST', '/api/timesheet-summary/bulk', {
      fileName: file.name,
      sheetName,
      replaceMonths: true,
      rows,
    });

    await loadSavedTimesheetFromDb();

    switchWorkSummaryTab(S.workSummaryTab || 'team');

    toast(
      `Saved ${saved.saved_rows} Time Sheet rows for ${saved.month_count} month${saved.month_count === 1 ? '' : 's'}`
    );
  } catch (e) {
    console.error(e);
    toast('Failed to read or save the Excel file', 'error');
  }
}
