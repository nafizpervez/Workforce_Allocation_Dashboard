/* Workforce Allocation Dashboard — timesheets/report.js */

let timesheetReportOptions = [];

function timesheetReportMonthInfo(monthLabel, rows = []) {
  const label = String(monthLabel || '').trim();
  const match = label.match(/^([A-Za-z]{3,9})\s+(\d{2}|\d{4})$/);
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  let year;
  let monthIndex;

  if (match) {
    monthIndex = monthNames.findIndex(name => (
      name.slice(0, 3).toLowerCase() === match[1].slice(0, 3).toLowerCase()
    ));
    year = Number(match[2]);
    if (year < 100) year += 2000;
  }

  if (!Number.isInteger(monthIndex) || monthIndex < 0 || !year) {
    const date = String(rows.find(row => row.workDate)?.workDate || '').match(
      /^(\d{4})-(\d{2})-(\d{2})$/,
    );
    if (!date) return null;
    year = Number(date[1]);
    monthIndex = Number(date[2]) - 1;
  }

  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return {
    year,
    monthIndex,
    monthName: monthNames[monthIndex],
    shortMonth: monthNames[monthIndex].slice(0, 3),
    daysInMonth,
    startDate: new Date(Date.UTC(year, monthIndex, 1)),
    endDate: new Date(Date.UTC(year, monthIndex, daysInMonth)),
  };
}

function timesheetReportDateIso(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function timesheetReportDateDisplay(date) {
  return [
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
    date.getUTCFullYear(),
  ].join('/');
}

function timesheetReportExcelSerial(date) {
  return Math.floor(date.getTime() / 86400000) + 25569;
}

function timesheetReportXmlEscape(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function timesheetReportCellXml(rowNumber, column, style, value, type = 'inline') {
  const reference = `${column}${rowNumber}`;
  if (value === null || value === undefined || value === '') {
    return `<c r="${reference}" s="${style}"/>`;
  }
  if (type === 'number') {
    return `<c r="${reference}" s="${style}"><v>${Number(value)}</v></c>`;
  }
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${timesheetReportXmlEscape(value)}</t></is></c>`;
}

function timesheetReportRowXml(rowNumber, cells, height = null) {
  const heightAttribute = Number(height) > 0
    ? ` ht="${Number(height).toFixed(1).replace(/\.0$/, '')}" customHeight="1"`
    : '';
  return `<row r="${rowNumber}" spans="1:4"${heightAttribute} x14ac:dyDescent="0.3">${cells.join('')}</row>`;
}

function timesheetReportSummaryLabel(workType) {
  const normalized = String(workType || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ');

  if (normalized.startsWith('service delivery')) return 'Service Delivery';
  if (/^pre\s*-?\s*sales?$/.test(normalized)) return 'Pre-Sales';
  if (normalized === 'skill development') return 'Skill Development';
  if (normalized === 'training delivery') return 'Training Delivery';
  if (normalized === 'general admin') return 'General Admin';
  return String(workType || '').trim();
}

function timesheetReportDetailText(row) {
  return String(
    row.comment ||
    row.customTaskName ||
    row.projectTask ||
    row.projectPhaseName ||
    row.projectName ||
    '',
  ).trim();
}

function timesheetReportFallbackRole(projectRole) {
  const role = String(projectRole || '').trim();
  if (/team\s*lead/i.test(role)) return 'GIS Lead';
  if (/consultant/i.test(role)) return 'GIS Consultant';
  if (/specialist/i.test(role)) return 'GIS Specialist';
  if (/engineer/i.test(role)) return 'GIS Specialist';
  return role || 'Team Member';
}

function timesheetReportRoleRank(role) {
  const value = String(role || '').toLowerCase();
  if (value.includes('lead')) return 0;
  if (value.includes('consultant')) return 1;
  if (value.includes('software')) return 2;
  if (value.includes('specialist')) return 3;
  return 4;
}

function timesheetReportUnique(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const cleaned = String(value || '').trim();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push(cleaned);
  }
  return result;
}

function timesheetReportEstimateHeight(summary, detail) {
  if (!summary && !detail) return null;

  const estimate = (value, charsPerLine) => String(value || '')
    .split(/\r?\n/)
    .reduce((lines, part) => lines + Math.max(1, Math.ceil(part.length / charsPerLine)), 0);

  const lineCount = Math.max(estimate(summary, 30), estimate(detail, 94));
  return Math.min(159, 27 + Math.max(0, lineCount - 1) * 13.2);
}

function timesheetReportBuildMembers(data, monthInfo) {
  const groups = new Map();
  const designations = data.designations || {};

  for (const row of data.rows || []) {
    const worker = canonicalPersonName(row.worker);
    if (!worker) continue;

    if (!groups.has(worker)) {
      const designation = String(designations[personIdentityKey(worker)] || '').trim();
      groups.set(worker, {
        worker,
        role: designation || timesheetReportFallbackRole(row.projectRole),
        firstSourceRow: Number(row.sourceRowNo) || Number.MAX_SAFE_INTEGER,
        byDate: new Map(),
      });
    }

    const member = groups.get(worker);
    member.firstSourceRow = Math.min(
      member.firstSourceRow,
      Number(row.sourceRowNo) || Number.MAX_SAFE_INTEGER,
    );
    if (!member.byDate.has(row.workDate)) member.byDate.set(row.workDate, []);
    member.byDate.get(row.workDate).push(row);
  }

  return [...groups.values()]
    .sort((a, b) => (
      timesheetReportRoleRank(a.role) - timesheetReportRoleRank(b.role) ||
      a.firstSourceRow - b.firstSourceRow ||
      a.worker.localeCompare(b.worker)
    ))
    .map(member => {
      const days = [];
      for (let day = 1; day <= monthInfo.daysInMonth; day++) {
        const date = new Date(Date.UTC(monthInfo.year, monthInfo.monthIndex, day));
        const dateRows = member.byDate.get(timesheetReportDateIso(date)) || [];
        const summary = timesheetReportUnique(
          dateRows.map(row => timesheetReportSummaryLabel(row.workType)),
        ).join('\n');
        const detail = timesheetReportUnique(
          dateRows.map(timesheetReportDetailText),
        ).join('\n');

        days.push({ date, summary, detail });
      }
      return { ...member, days };
    });
}

function timesheetReportBuildSheetXml(templateXml, data, projectLabel, customerLabel) {
  const monthInfo = timesheetReportMonthInfo(data.month, data.rows);
  if (!monthInfo) throw new Error('The selected Time Sheet month could not be parsed.');

  const members = timesheetReportBuildMembers(data, monthInfo);
  if (!members.length) throw new Error('No reportable member rows were found.');

  const rows = [];
  const merges = ['A1:D1', 'A3:B3', 'A4:B4', 'A5:B5'];
  const period = `${timesheetReportDateDisplay(monthInfo.startDate)} - ${timesheetReportDateDisplay(monthInfo.endDate)}`;

  rows.push(timesheetReportRowXml(1, [
    timesheetReportCellXml(1, 'A', 56, 'Timesheet Report'),
    timesheetReportCellXml(1, 'B', 56, ''),
    timesheetReportCellXml(1, 'C', 56, ''),
    timesheetReportCellXml(1, 'D', 56, ''),
  ], 25.8));
  rows.push(timesheetReportRowXml(2, [
    timesheetReportCellXml(2, 'A', 1, ''),
    timesheetReportCellXml(2, 'B', 2, ''),
    timesheetReportCellXml(2, 'C', 1, ''),
    timesheetReportCellXml(2, 'D', 15, ''),
  ]));
  rows.push(timesheetReportRowXml(3, [
    timesheetReportCellXml(3, 'A', 57, 'Project'),
    timesheetReportCellXml(3, 'B', 57, ''),
    timesheetReportCellXml(3, 'C', 3, ':'),
    timesheetReportCellXml(3, 'D', 16, projectLabel),
  ]));
  rows.push(timesheetReportRowXml(4, [
    timesheetReportCellXml(4, 'A', 57, 'Customer'),
    timesheetReportCellXml(4, 'B', 57, ''),
    timesheetReportCellXml(4, 'C', 3, ':'),
    timesheetReportCellXml(4, 'D', 16, customerLabel),
  ]));
  rows.push(timesheetReportRowXml(5, [
    timesheetReportCellXml(5, 'A', 57, 'Period'),
    timesheetReportCellXml(5, 'B', 57, ''),
    timesheetReportCellXml(5, 'C', 3, ':'),
    timesheetReportCellXml(5, 'D', 17, period),
  ]));
  rows.push(timesheetReportRowXml(6, [
    timesheetReportCellXml(6, 'A', 5, ''),
    timesheetReportCellXml(6, 'B', 6, ''),
    timesheetReportCellXml(6, 'C', 5, ''),
    timesheetReportCellXml(6, 'D', 15, ''),
  ]));

  let rowNumber = 7;

  members.forEach((member, memberIndex) => {
    const firstMember = memberIndex === 0;
    const headerStyles = firstMember
      ? [[58, 59, 60, 61], [49, 51, 62, 55], [49, 51, 4, 7]]
      : [[48, 50, 52, 53], [49, 51, 54, 55], [49, 51, 4, 18]];

    rows.push(timesheetReportRowXml(rowNumber, [
      timesheetReportCellXml(rowNumber, 'A', headerStyles[0][0], 'Day'),
      timesheetReportCellXml(rowNumber, 'B', headerStyles[0][1], 'Date'),
      timesheetReportCellXml(rowNumber, 'C', headerStyles[0][2], 'Member Name & Roles'),
      timesheetReportCellXml(rowNumber, 'D', headerStyles[0][3], ''),
    ]));
    rows.push(timesheetReportRowXml(rowNumber + 1, [
      timesheetReportCellXml(rowNumber + 1, 'A', headerStyles[1][0], ''),
      timesheetReportCellXml(rowNumber + 1, 'B', headerStyles[1][1], ''),
      timesheetReportCellXml(rowNumber + 1, 'C', headerStyles[1][2], `${member.worker} - ${member.role}`),
      timesheetReportCellXml(rowNumber + 1, 'D', headerStyles[1][3], ''),
    ]));
    rows.push(timesheetReportRowXml(rowNumber + 2, [
      timesheetReportCellXml(rowNumber + 2, 'A', headerStyles[2][0], ''),
      timesheetReportCellXml(rowNumber + 2, 'B', headerStyles[2][1], ''),
      timesheetReportCellXml(rowNumber + 2, 'C', headerStyles[2][2], 'Summary'),
      timesheetReportCellXml(rowNumber + 2, 'D', headerStyles[2][3], 'Detail'),
    ]));

    merges.push(
      `A${rowNumber}:A${rowNumber + 2}`,
      `B${rowNumber}:B${rowNumber + 2}`,
      `C${rowNumber}:D${rowNumber}`,
      `C${rowNumber + 1}:D${rowNumber + 1}`,
    );

    rowNumber += 3;

    member.days.forEach((dayRow, dayIndex) => {
      const isFirstDay = dayIndex === 0;
      const isLastDay = dayIndex === member.days.length - 1;
      const hasSummaryOnly = Boolean(dayRow.summary) && !dayRow.detail;
      const hasContent = Boolean(dayRow.summary || dayRow.detail);

      let styles;
      if (isLastDay) {
        styles = hasSummaryOnly ? [40, 41, 65, 66] : [40, 41, hasContent ? 23 : 32, 43];
      } else if (hasSummaryOnly) {
        styles = [isFirstDay ? 31 : 25, 26, 73, 74];
      } else if (hasContent) {
        styles = [isFirstDay ? 31 : 25, 26, 23, isFirstDay ? 28 : 34];
      } else {
        styles = [8, 14, 24, 30];
      }

      rows.push(timesheetReportRowXml(rowNumber, [
        timesheetReportCellXml(
          rowNumber,
          'A',
          styles[0],
          dayRow.date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
        ),
        timesheetReportCellXml(
          rowNumber,
          'B',
          styles[1],
          timesheetReportExcelSerial(dayRow.date),
          'number',
        ),
        timesheetReportCellXml(rowNumber, 'C', styles[2], dayRow.summary),
        timesheetReportCellXml(rowNumber, 'D', styles[3], dayRow.detail),
      ], timesheetReportEstimateHeight(dayRow.summary, dayRow.detail)));

      if (hasSummaryOnly) merges.push(`C${rowNumber}:D${rowNumber}`);
      rowNumber++;
    });
  });

  const footerBlankOne = rowNumber;
  const footerBlankTwo = rowNumber + 1;
  const footerHeader = rowNumber + 2;
  const signatureStart = rowNumber + 3;
  const signatureEnd = rowNumber + 8;
  const nameRow = rowNumber + 9;
  const titleSpacerRow = rowNumber + 10;
  const titleRow = rowNumber + 11;

  rows.push(timesheetReportRowXml(footerBlankOne, [
    timesheetReportCellXml(footerBlankOne, 'A', 9, ''),
    timesheetReportCellXml(footerBlankOne, 'B', 11, ''),
    timesheetReportCellXml(footerBlankOne, 'C', 9, ''),
    timesheetReportCellXml(footerBlankOne, 'D', 10, ''),
  ]));
  rows.push(timesheetReportRowXml(footerBlankTwo, [
    timesheetReportCellXml(footerBlankTwo, 'A', 12, ''),
    timesheetReportCellXml(footerBlankTwo, 'B', 12, ''),
    timesheetReportCellXml(footerBlankTwo, 'C', 12, ''),
    timesheetReportCellXml(footerBlankTwo, 'D', 12, ''),
  ]));
  rows.push(timesheetReportRowXml(footerHeader, [
    timesheetReportCellXml(footerHeader, 'A', 77, 'Prepared By'),
    timesheetReportCellXml(footerHeader, 'B', 78, ''),
    timesheetReportCellXml(footerHeader, 'C', 78, ''),
    timesheetReportCellXml(footerHeader, 'D', 19, 'Approved By'),
  ]));

  for (let row = signatureStart; row <= signatureEnd; row++) {
    const lastSignatureRow = row === signatureEnd;
    rows.push(timesheetReportRowXml(row, [
      timesheetReportCellXml(row, 'A', lastSignatureRow ? 82 : 79, ''),
      timesheetReportCellXml(row, 'B', lastSignatureRow ? 83 : 80, ''),
      timesheetReportCellXml(row, 'C', lastSignatureRow ? 84 : 81, ''),
      timesheetReportCellXml(row, 'D', lastSignatureRow ? 86 : 85, ''),
    ]));
  }

  rows.push(timesheetReportRowXml(nameRow, [
    timesheetReportCellXml(nameRow, 'A', 87, 'Debashish Bhowmick'),
    timesheetReportCellXml(nameRow, 'B', 88, ''),
    timesheetReportCellXml(nameRow, 'C', 89, ''),
    timesheetReportCellXml(nameRow, 'D', 20, 'Mohd. Izzudin Abu Suhor'),
  ]));
  rows.push(timesheetReportRowXml(titleSpacerRow, [
    timesheetReportCellXml(titleSpacerRow, 'A', 67, ''),
    timesheetReportCellXml(titleSpacerRow, 'B', 68, ''),
    timesheetReportCellXml(titleSpacerRow, 'C', 69, ''),
    timesheetReportCellXml(titleSpacerRow, 'D', 20, ''),
  ]));
  rows.push(timesheetReportRowXml(titleRow, [
    timesheetReportCellXml(titleRow, 'A', 70, 'Project Manager\nEsri Bangladesh'),
    timesheetReportCellXml(titleRow, 'B', 71, ''),
    timesheetReportCellXml(titleRow, 'C', 72, ''),
    timesheetReportCellXml(titleRow, 'D', 21, 'Project Manager \nEsri Malaysia'),
  ]));

  merges.push(
    `A${footerHeader}:C${footerHeader}`,
    `A${signatureStart}:C${signatureEnd}`,
    `D${signatureStart}:D${signatureEnd}`,
    `A${nameRow}:C${nameRow}`,
    `A${titleSpacerRow}:C${titleSpacerRow}`,
    `A${titleRow}:C${titleRow}`,
  );

  const sheetData = `<sheetData>${rows.join('')}</sheetData>`;
  const mergeCells = `<mergeCells count="${merges.length}">${merges.map(reference => (
    `<mergeCell ref="${reference}"/>`
  )).join('')}</mergeCells>`;

  return templateXml
    .replace(/<dimension\s+ref="[^"]+"\s*\/>/, `<dimension ref="A1:D${titleRow}"/>`)
    .replace(/<sheetData\s*\/>|<sheetData>.*?<\/sheetData>/s, sheetData)
    .replace('<pageMargins', `${mergeCells}<pageMargins`);
}

function timesheetReportSafeSheetName(monthInfo) {
  return `${monthInfo.monthName}_${monthInfo.year}`.slice(0, 31);
}

function timesheetReportSafeFilePart(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function timesheetReportProjectForSelection() {
  const month = document.getElementById('timesheetReportMonth')?.value || '';
  const projectName = document.getElementById('timesheetReportProject')?.value || '';
  const monthOption = timesheetReportOptions.find(option => option.month === month);
  return monthOption?.projects?.find(project => project.projectName === projectName) || null;
}

function syncTimesheetReportProjectOptions() {
  const monthSelect = document.getElementById('timesheetReportMonth');
  const projectSelect = document.getElementById('timesheetReportProject');
  if (!monthSelect || !projectSelect) return;

  const monthOption = timesheetReportOptions.find(option => option.month === monthSelect.value);
  const projects = monthOption?.projects || [];
  projectSelect.innerHTML = projects.map(project => (
    `<option value="${esc(project.projectName)}">${esc(project.projectName)} · ${Number(project.totalHours || 0).toFixed(1)} hrs</option>`
  )).join('');
  syncTimesheetReportLabels();
}

function syncTimesheetReportLabels() {
  const project = timesheetReportProjectForSelection();
  const projectLabel = document.getElementById('timesheetReportProjectLabel');
  const customerLabel = document.getElementById('timesheetReportCustomerLabel');
  if (projectLabel) projectLabel.value = project?.projectLabel || project?.projectName || '';
  if (customerLabel) customerLabel.value = project?.customerLabel || project?.customer || '';
}

async function openTimesheetReportModal() {
  if (typeof JSZip === 'undefined') {
    toast('The report generator library is not loaded. Check internet/CDN access for JSZip.', 'error');
    return;
  }

  try {
    const data = await api('GET', '/api/timesheet-report/options');
    timesheetReportOptions = data.months || [];

    if (!timesheetReportOptions.length) {
      toast('No detailed report data is available. Re-upload a Time Sheet so Date and Comment rows can be saved.', 'info');
      return;
    }

    const monthOptions = timesheetReportOptions.map(option => (
      `<option value="${esc(option.month)}">${esc(option.month)}</option>`
    )).join('');

    openModal(`
      ${mHdr('Generate Time Sheet Report', 'Download the selected month and project in the fixed approved Excel format.')}
      <div class="p-6 space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label class="timesheet-report-field">
            <span>Month</span>
            <select id="timesheetReportMonth" onchange="syncTimesheetReportProjectOptions()">
              ${monthOptions}
            </select>
          </label>
          <label class="timesheet-report-field">
            <span>Project</span>
            <select id="timesheetReportProject" onchange="syncTimesheetReportLabels()"></select>
          </label>
        </div>
        <label class="timesheet-report-field">
          <span>Report Project</span>
          <input id="timesheetReportProjectLabel" type="text" />
        </label>
        <label class="timesheet-report-field">
          <span>Report Customer</span>
          <input id="timesheetReportCustomerLabel" type="text" />
        </label>
        <div class="timesheet-report-format-note">
          The workbook uses the approved fixed template. Column order, column widths, row formatting, merged cells, signature area, and print setup are not autofitted or redesigned.
        </div>
      </div>
      <div class="modal-footer p-6 border-t border-gray-200 flex justify-end gap-3 bg-gray-50 rounded-b-2xl">
        <button onclick="closeModal()" class="btn-gray">Cancel</button>
        <button id="timesheetReportGenerateBtn" onclick="generateTimesheetReport()" class="btn-blue">Generate &amp; Download</button>
      </div>
    `, 'max-w-2xl');

    syncTimesheetReportProjectOptions();
  } catch (error) {
    console.error(error);
    toast(error.message || 'Failed to load Time Sheet report options', 'error');
  }
}

async function generateTimesheetReport() {
  const month = document.getElementById('timesheetReportMonth')?.value || '';
  const projectName = document.getElementById('timesheetReportProject')?.value || '';
  const projectLabel = document.getElementById('timesheetReportProjectLabel')?.value.trim() || '';
  const customerLabel = document.getElementById('timesheetReportCustomerLabel')?.value.trim() || '';
  const button = document.getElementById('timesheetReportGenerateBtn');

  if (!month || !projectName || !projectLabel || !customerLabel) {
    toast('Select a month and project and complete both report labels.', 'error');
    return;
  }

  try {
    if (button) {
      button.disabled = true;
      button.textContent = 'Generating...';
    }

    const data = await api(
      'GET',
      `/api/timesheet-report/data?month=${encodeURIComponent(month)}&projectName=${encodeURIComponent(projectName)}`,
    );
    const monthInfo = timesheetReportMonthInfo(data.month, data.rows);
    if (!monthInfo) throw new Error('The selected month is not valid.');

    const templateResponse = await fetch('/templates/timesheet-report-template.xlsx', {
      cache: 'no-store',
    });
    if (!templateResponse.ok) throw new Error('The fixed Time Sheet report template could not be loaded.');

    const zip = await JSZip.loadAsync(await templateResponse.arrayBuffer());
    const sheetFile = zip.file('xl/worksheets/sheet1.xml');
    const workbookFile = zip.file('xl/workbook.xml');
    if (!sheetFile || !workbookFile) throw new Error('The report template is incomplete.');

    const sheetXml = await sheetFile.async('string');
    zip.file(
      'xl/worksheets/sheet1.xml',
      timesheetReportBuildSheetXml(sheetXml, data, projectLabel, customerLabel),
    );

    const sheetName = timesheetReportSafeSheetName(monthInfo);
    const workbookXml = (await workbookFile.async('string')).replace(
      /(<sheet\s+name=")[^"]+("\s+sheetId="[^"]+")/,
      `$1${timesheetReportXmlEscape(sheetName)}$2`,
    );
    zip.file('xl/workbook.xml', workbookXml);

    const appFile = zip.file('docProps/app.xml');
    if (appFile) {
      const appXml = (await appFile.async('string')).replace(
        /(<TitlesOfParts>.*?<vt:lpstr>)[^<]*(<\/vt:lpstr>.*?<\/TitlesOfParts>)/s,
        `$1${timesheetReportXmlEscape(sheetName)}$2`,
      );
      zip.file('docProps/app.xml', appXml);
    }

    const coreFile = zip.file('docProps/core.xml');
    if (coreFile) {
      const modified = new Date().toISOString();
      const coreXml = (await coreFile.async('string')).replace(
        /<dcterms:modified[^>]*>.*?<\/dcterms:modified>/s,
        `<dcterms:modified xsi:type="dcterms:W3CDTF">${modified}</dcterms:modified>`,
      );
      zip.file('docProps/core.xml', coreXml);
    }

    const blob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const projectFilePart = /ju?pem/i.test(projectName) ? 'JUPEM' : projectName;
    const fileName = [
      'Timesheet Report',
      timesheetReportSafeFilePart(customerLabel),
      timesheetReportSafeFilePart(projectFilePart),
      `${monthInfo.monthName} ${monthInfo.year}`,
    ].filter(Boolean).join(' - ') + '.xlsx';

    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    closeModal();
    toast(`Generated ${fileName}`);
  } catch (error) {
    console.error(error);
    toast(error.message || 'Failed to generate the Time Sheet report', 'error');
  } finally {
    if (button && document.body.contains(button)) {
      button.disabled = false;
      button.textContent = 'Generate & Download';
    }
  }
}
