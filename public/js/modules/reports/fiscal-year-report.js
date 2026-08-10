/* Workforce Allocation Dashboard — reports/fiscal-year-report.js
   Generates the selected Matrix fiscal year as a five-page A4 portrait DOCX.

   The Word layout intentionally follows the supplied management-report reference:
     Page 1: report title, four KPI tiles, Capacity Allocation donut + legend, planning basis
     Page 2: 1. Executive Summary + 2. Available Capacity Summary
     Page 3: 3. Maximum Revenue Capacity + 4. Revenue Targets
     Page 4: 5. Capacity Value Allocation
     Page 5: 6. Pipeline Target Summary

   All report values remain live dashboard values for the currently selected Matrix FY.
   Native Word text/tables are used throughout; only the donut is embedded as a PNG. */

const FISCAL_YEAR_DOCX = Object.freeze({
  pageWidth: 11906, // A4 portrait, twips
  pageHeight: 16838,
  // Use Word's Normal margin preset: exactly 1 inch on every side.
  marginLeft: 1440,
  marginRight: 1440,
  marginTop: 1440,
  marginBottom: 1440,
  headerDistance: 288,
  footerDistance: 346,
  usableWidth: 9026,
  tableRowHeightScale: 1.5,
  navy: '173B63',
  blue: '2F75B5',
  text: '26313C',
  muted: '66758A',
  light: 'EEF3F9',
  total: 'D6E4F3',
  grid: 'C9D7E6',
  white: 'FFFFFF',
  lineBlue: '2E75B6',
});

const FISCAL_YEAR_CAPACITY_LEGEND_COLOR_MAP = Object.freeze({
  'Intra-Sourcing': '377CB7',
  'Local PS': '2A9D8F',
  'Training Delivery': 'F2B51D',
  'Training Support': 'F2B51D',
  'Pre Sale': '8061A6',
  'Pre-Sale': '8061A6',
  'Presales': '8061A6',
  'Skill Development': '6EAF45',
  'General Admin': '5A9BD5',
  'General Administration': '5A9BD5',
});

function fiscalYearReportNormalizeText(value) {
  return String(value ?? '')
    .replace(/\bIntrasourcing\b/gi, 'Intra-Sourcing')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function fiscalYearReportColorToHex(value, fallback = '94A3B8') {
  const raw = String(value || '').trim();
  const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const valueHex = hex[1];
    return valueHex.length === 3
      ? valueHex.split('').map(char => `${char}${char}`).join('').toUpperCase()
      : valueHex.toUpperCase();
  }
  const rgb = raw.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) {
    return [rgb[1], rgb[2], rgb[3]]
      .map(component => Math.max(0, Math.min(255, Number(component))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  }
  return fallback;
}

function fiscalYearReportLegendColor(label, fallback) {
  const normalized = String(label || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const exact = Object.entries(FISCAL_YEAR_CAPACITY_LEGEND_COLOR_MAP)
    .find(([key]) => key.toLowerCase().replace(/[^a-z0-9]+/g, ' ') === normalized);
  return exact ? exact[1] : (fallback || '94A3B8');
}

function fiscalYearReportCompactFyLabel(value) {
  const text = String(value || '').trim();
  const fourDigit = text.match(/(20\d{2})/);
  if (fourDigit) return `FY${String(fourDigit[1]).slice(-2)}`;
  const twoDigit = text.match(/FY\s*(\d{2})/i);
  return twoDigit ? `FY${twoDigit[1]}` : text.replace(/\s+/g, '');
}

function fiscalYearReportNextFyLabel(value) {
  const text = String(value || '').trim();
  const fourDigit = text.match(/(20\d{2})/);
  if (fourDigit) return `FY${String(Number(fourDigit[1]) + 1).slice(-2)}`;
  const twoDigit = text.match(/FY\s*(\d{2})/i);
  if (twoDigit) return `FY${String((Number(twoDigit[1]) + 1) % 100).padStart(2, '0')}`;
  return 'Next FY';
}

function fiscalYearReportCurrency(value, decimals = true) {
  const amount = Number(value) || 0;
  const absoluteText = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  });
  return amount < 0 ? `-USD ${absoluteText}` : `USD ${absoluteText}`;
}

function fiscalYearReportCompactCurrency(value) {
  const amount = Number(value) || 0;
  const absolute = Math.abs(amount);
  if (absolute >= 1000000) {
    const v = absolute / 1000000;
    return `${amount < 0 ? '-' : ''}USD ${v.toLocaleString('en-US', { maximumFractionDigits: v >= 10 ? 0 : 1 })}M`;
  }
  if (absolute >= 1000) {
    const v = absolute / 1000;
    return `${amount < 0 ? '-' : ''}USD ${v.toLocaleString('en-US', { maximumFractionDigits: v >= 10 ? 0 : 1 })}K`;
  }
  return fiscalYearReportCurrency(amount, false);
}

function fiscalYearReportDays(value, suffix = '') {
  const amount = Number(value) || 0;
  const text = amount.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return suffix ? `${text} ${suffix}` : text;
}

function fiscalYearReportFte(value, suffix = false) {
  const amount = Number(value) || 0;
  const text = amount.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  });
  return suffix ? `${text} FTE` : text;
}

function fiscalYearReportPercent(value) {
  const amount = Number(value) || 0;
  return `${amount.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 1,
    maximumFractionDigits: 1,
  })}%`;
}

function fiscalYearReportRate(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return '—';
  return fiscalYearReportCurrency(amount, true);
}

function fiscalYearReportSafeRatioPercent(value, total) {
  const numerator = Number(value) || 0;
  const denominator = Number(total) || 0;
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

function getFiscalYearExportChartImage() {
  try {
    const chart = S.charts?.capacityAllocationExecutive;
    const sourceCanvas = chart?.canvas || document.getElementById('capacityAllocationExecutiveChart');
    if (!sourceCanvas || typeof sourceCanvas.toDataURL !== 'function') return null;

    const backingWidth = Math.max(1, Number(sourceCanvas.width) || 1);
    const backingHeight = Math.max(1, Number(sourceCanvas.height) || 1);
    const logicalWidth = Math.max(1, Number(chart?.width) || Number(sourceCanvas.clientWidth) || backingWidth);
    const logicalHeight = Math.max(1, Number(chart?.height) || Number(sourceCanvas.clientHeight) || backingHeight);
    const scaleX = backingWidth / logicalWidth;
    const scaleY = backingHeight / logicalHeight;

    // Crop the actual doughnut to a square before placing it in Word. This keeps
    // the exported chart circular even though the dashboard canvas is a wide,
    // responsive rectangle.
    const arc = chart?.getDatasetMeta?.(0)?.data?.[0];
    const radius = Math.max(1, Number(arc?.outerRadius) || Math.min(logicalWidth, logicalHeight) * 0.42);
    const centerX = Number(arc?.x) || logicalWidth / 2;
    const centerY = Number(arc?.y) || logicalHeight / 2;
    const padding = Math.max(10, Math.min(24, radius * 0.1));
    const cropSize = Math.min(logicalWidth, logicalHeight, (radius + padding) * 2);
    const sourceX = Math.max(0, Math.min(logicalWidth - cropSize, centerX - cropSize / 2));
    const sourceY = Math.max(0, Math.min(logicalHeight - cropSize, centerY - cropSize / 2));

    const outputSize = 1400;
    const targetCanvas = document.createElement('canvas');
    targetCanvas.width = outputSize;
    targetCanvas.height = outputSize;
    const context = targetCanvas.getContext('2d');
    if (!context) return sourceCanvas.toDataURL('image/png', 1);

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.clearRect(0, 0, outputSize, outputSize);
    context.drawImage(
      sourceCanvas,
      sourceX * scaleX,
      sourceY * scaleY,
      cropSize * scaleX,
      cropSize * scaleY,
      0,
      0,
      outputSize,
      outputSize,
    );

    const dataUrl = targetCanvas.toDataURL('image/png', 1);
    return dataUrl?.startsWith('data:image/') ? dataUrl : null;
  } catch (error) {
    console.warn('Unable to capture the Capacity Allocation chart for the fiscal-year report.', error);
    return null;
  }
}

function fiscalYearReportBuildPlanningBasis(summary, nonAssignableActiveCount = 0) {
  const parts = [`Planning basis: ${summary.assignableCount.toLocaleString()} visible delivery resources`];
  if (nonAssignableActiveCount > 0) {
    parts.push(`${nonAssignableActiveCount.toLocaleString()} active non-assignable management resource${nonAssignableActiveCount === 1 ? '' : 's'} excluded`);
  }
  const partialRows = (summary.availableRows || []).filter(row => String(row.basis || '') !== 'Full Year');
  if (partialRows.length) {
    parts.push('available working days reflect configured fiscal-year availability');
  } else {
    parts.push('all visible delivery resources use their configured annual workdays');
  }
  return `${parts.join('; ')}.`;
}

function fiscalYearReportBuildRevenueTargets(summary) {
  const trainingMetric = summary.categoryMetrics?.training || {};
  const definitions = [
    { label: 'Intra-Sourcing', target: Number(summary.committedTargets?.intrasourcing) || 0, key: 'intrasourcing', explicit: true },
    { label: 'Local Professional Services', target: Number(summary.committedTargets?.local) || 0, key: 'local', explicit: true },
    { label: 'Training Delivery', target: Number(trainingMetric.capacityValue) || 0, key: 'training', explicit: false },
  ];

  const rows = definitions.map(row => {
    const metric = summary.categoryMetrics?.[row.key] || {};
    let rate = 0;
    if (Number(metric.allocatedMandays) > 0 && Number(metric.capacityValue) > 0) {
      rate = Number(metric.capacityValue) / Number(metric.allocatedMandays);
    } else if (summary.availableCapacityDays > 0) {
      rate = row.key === 'intrasourcing'
        ? Number(summary.intrasourcingRevenueCapacity) / Number(summary.availableCapacityDays)
        : Number(summary.localRevenueCapacity) / Number(summary.availableCapacityDays);
    }
    const manDays = rate > 0 ? row.target / rate : 0;
    const fte = summary.defaultAnnualWorkdays > 0 ? manDays / summary.defaultAnnualWorkdays : 0;
    return { ...row, rate, manDays, fte };
  });

  return {
    rows,
    totalTarget: rows.filter(row => row.explicit).reduce((sum, row) => sum + row.target, 0),
    totalDays: rows.reduce((sum, row) => sum + row.manDays, 0),
    totalFte: rows.reduce((sum, row) => sum + row.fte, 0),
  };
}

function fiscalYearReportBuildPipelineNotes(summary, fiscalYearLabel) {
  const localPipelineTarget = Number(summary.committedTargets?.localPipeline) || 0;
  const multiplier = typeof getCapacityPipelineMultiplier === 'function' ? getCapacityPipelineMultiplier() : 0;
  const baseRequirement = localPipelineTarget * multiplier;
  const probableRealizedThisFY = typeof getCapacityProbableRealizedThisFY === 'function' ? getCapacityProbableRealizedThisFY() : 0;
  const localTargetNextFY = baseRequirement + probableRealizedThisFY;
  const alreadyWorkingWith = Number(summary.preSalePipeline?.totalAmount) || 0;
  const buckets = summary.preSalePipeline?.buckets || { secured: 0, bestCase: 0, prospect: 0 };

  return {
    nextFyLabel: fiscalYearReportNextFyLabel(fiscalYearLabel),
    localPipelineTarget,
    multiplier,
    baseRequirement,
    probableRealizedThisFY,
    localTargetNextFY,
    alreadyWorkingWith,
    securedMinPercent: Number(summary.preSalePipeline?.securedMinPercent) || 0,
    bestCaseMinPercent: Number(summary.preSalePipeline?.bestCaseMinPercent) || 0,
    securedAmount: Number(buckets.secured) || 0,
    bestCaseAmount: Number(buckets.bestCase) || 0,
    prospectAmount: Number(buckets.prospect) || 0,
    pipelineGap: localTargetNextFY - alreadyWorkingWith,
    securedShare: fiscalYearReportSafeRatioPercent(buckets.secured, alreadyWorkingWith),
    bestCaseShare: fiscalYearReportSafeRatioPercent(buckets.bestCase, alreadyWorkingWith),
    prospectShare: fiscalYearReportSafeRatioPercent(buckets.prospect, alreadyWorkingWith),
  };
}

function collectFiscalYearReportData() {
  if (typeof getCapacityExecutiveSummary !== 'function') {
    throw new Error('Capacity planning data is still loading. Try the export again in a moment.');
  }

  const requiredCardKeys = [
    'capacity-allocation',
    'executive-metrics',
    'available-capacity-summary',
    'maximum-revenue-capacity',
    'revenue-targets',
    'capacity-value-allocation',
    'pipeline-target-summary',
  ];
  const missing = requiredCardKeys.filter(key => !document.querySelector(`.dc[data-card-key="${key}"]`));
  if (missing.length) throw new Error('The capacity-planning cards are still loading. Try the export again in a moment.');

  const summary = getCapacityExecutiveSummary();
  const activeTeam = typeof getCapacityExecutiveActiveTeam === 'function'
    ? getCapacityExecutiveActiveTeam()
    : { allActive: [], assignable: [] };
  const nonAssignableActiveCount = Math.max(0, (activeTeam.allActive?.length || 0) - (activeTeam.assignable?.length || 0));
  const fiscalYearLabel = summary.fiscalYearLabel || (typeof fiscalYearDisplayLabel === 'function'
    ? fiscalYearDisplayLabel(S.matrixFiscalYear)
    : `FY ${Number(S.matrixFiscalYear) + 1}`);
  const compactFyLabel = fiscalYearReportCompactFyLabel(fiscalYearLabel);
  const chartImage = getFiscalYearExportChartImage();
  const capacityValueRows = typeof getCapacityValueRows === 'function'
    ? getCapacityValueRows(summary)
    : { billable: [], functionRows: [] };
  const revenueTargets = fiscalYearReportBuildRevenueTargets(summary);
  const pipelineNotes = fiscalYearReportBuildPipelineNotes(summary, fiscalYearLabel);

  const legend = (summary.allocationMix?.rows || []).map(row => ({
    label: fiscalYearReportNormalizeText(row.label),
    value: fiscalYearReportPercent(row.share),
    color: fiscalYearReportLegendColor(row.label, fiscalYearReportColorToHex(row.color)),
  }));

  return {
    summary,
    fiscalYearLabel,
    compactFyLabel,
    chartImage,
    chartCaption: `Capacity allocation ${compactFyLabel.replace(/^FY/, 'FY ')}`,
    planningBasis: fiscalYearReportBuildPlanningBasis(summary, nonAssignableActiveCount),
    nonAssignableActiveCount,
    legend,
    revenueTargets,
    capacityValueRows,
    pipelineNotes,
  };
}

function fiscalYearReportDocxLibrary() {
  const library = typeof window !== 'undefined' ? window.docx : null;
  if (!library?.Document || !library?.Packer || !library?.Paragraph || !library?.Table || !library?.Footer) {
    throw new Error('The Word report generator library is unavailable. Refresh the page and try again.');
  }
  return library;
}

function fiscalYearReportDocxAlignment(library, value) {
  if (value === 'center') return library.AlignmentType.CENTER;
  if (value === 'right') return library.AlignmentType.RIGHT;
  return library.AlignmentType.LEFT;
}

function fiscalYearReportDocxScaleWidths(widths, targetWidth = FISCAL_YEAR_DOCX.usableWidth) {
  const source = (widths || []).map(value => Math.max(1, Number(value) || 1));
  const sourceTotal = source.reduce((sum, value) => sum + value, 0) || 1;
  const target = Math.max(1, Math.round(Number(targetWidth) || FISCAL_YEAR_DOCX.usableWidth));
  let used = 0;
  return source.map((value, index) => {
    if (index === source.length - 1) return Math.max(1, target - used);
    const scaled = Math.max(1, Math.round((value / sourceTotal) * target));
    used += scaled;
    return scaled;
  });
}

function fiscalYearReportDocxScaledRowMargin(value) {
  const base = Math.max(0, Number(value) || 0);
  return Math.round(base * FISCAL_YEAR_DOCX.tableRowHeightScale);
}

function fiscalYearReportDocxRun(library, text, options = {}) {
  return new library.TextRun({
    text: String(text ?? ''),
    bold: Boolean(options.bold),
    italics: Boolean(options.italic),
    color: options.color || FISCAL_YEAR_DOCX.text,
    size: options.size || 20,
    font: 'Arial',
    break: options.break,
  });
}

function fiscalYearReportDocxRuns(library, text, options = {}) {
  return String(text ?? '').split('\n').map((line, index) => fiscalYearReportDocxRun(library, line, {
    ...options,
    break: index ? 1 : undefined,
  }));
}

function fiscalYearReportDocxParagraph(library, text, options = {}) {
  const config = {
    children: fiscalYearReportDocxRuns(library, text, options),
    alignment: fiscalYearReportDocxAlignment(library, options.align || 'left'),
    spacing: {
      before: Number(options.before) || 0,
      after: options.after === undefined ? 80 : Number(options.after) || 0,
      line: Number(options.line) || 276,
    },
    keepNext: Boolean(options.keepNext),
  };
  if (options.indent) config.indent = options.indent;
  if (options.border) config.border = options.border;
  return new library.Paragraph(config);
}

function fiscalYearReportDocxSpacer(library, after = 80) {
  return new library.Paragraph({
    children: [fiscalYearReportDocxRun(library, '', { size: 4 })],
    spacing: { before: 0, after, line: 80 },
  });
}

function fiscalYearReportDocxBorder(library, color = FISCAL_YEAR_DOCX.grid, size = 1) {
  return { style: library.BorderStyle.SINGLE, size, color };
}

function fiscalYearReportDocxNoBorder(library) {
  return { style: library.BorderStyle.NONE, size: 0, color: FISCAL_YEAR_DOCX.white };
}

function fiscalYearReportDocxBorders(library, color = FISCAL_YEAR_DOCX.grid) {
  const edge = fiscalYearReportDocxBorder(library, color, 1);
  return {
    top: edge,
    bottom: edge,
    left: edge,
    right: edge,
    insideHorizontal: edge,
    insideVertical: edge,
  };
}

function fiscalYearReportDocxCell(library, children, options = {}) {
  const noBorder = fiscalYearReportDocxNoBorder(library);
  const sourceBorders = options.borders;
  const cellBorders = sourceBorders ? {
    top: sourceBorders.top || noBorder,
    bottom: sourceBorders.bottom || noBorder,
    left: sourceBorders.left || noBorder,
    right: sourceBorders.right || noBorder,
  } : (options.borderless ? {
    top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
  } : undefined);
  return new library.TableCell({
    children: Array.isArray(children) ? children : [children],
    width: options.width ? { size: Math.max(1, Math.round(options.width)), type: library.WidthType.DXA } : undefined,
    shading: options.fill ? { fill: options.fill, color: 'auto', type: library.ShadingType.CLEAR } : undefined,
    verticalAlign: options.vertical || library.VerticalAlign.CENTER,
    margins: {
      top: fiscalYearReportDocxScaledRowMargin(options.marginTop ?? 55),
      right: options.marginRight ?? 70,
      bottom: fiscalYearReportDocxScaledRowMargin(options.marginBottom ?? 55),
      left: options.marginLeft ?? 70,
    },
    borders: cellBorders,
  });
}

function fiscalYearReportDocxCellParagraph(library, text, options = {}) {
  if (Array.isArray(options.segments) && options.segments.length) {
    return new library.Paragraph({
      children: options.segments.map(segment => fiscalYearReportDocxRun(library, segment.text, {
        bold: Boolean(segment.bold),
        italic: Boolean(segment.italic),
        color: segment.color || options.color || FISCAL_YEAR_DOCX.text,
        size: segment.size || options.size || 18,
      })),
      alignment: fiscalYearReportDocxAlignment(library, options.align || 'left'),
      spacing: { before: 0, after: 0, line: options.line || 248 },
    });
  }
  return fiscalYearReportDocxParagraph(library, text, {
    align: options.align || 'left',
    bold: Boolean(options.bold),
    italic: Boolean(options.italic),
    color: options.color || FISCAL_YEAR_DOCX.text,
    size: options.size || 18,
    after: 0,
    line: options.line || 248,
  });
}

function fiscalYearReportDocxSectionHeading(library, text, options = {}) {
  return fiscalYearReportDocxParagraph(library, text, {
    bold: true,
    color: FISCAL_YEAR_DOCX.navy,
    size: options.size || 31,
    before: options.before || 0,
    after: options.after ?? 80,
    line: 252,
    keepNext: true,
    border: {
      bottom: {
        style: library.BorderStyle.SINGLE,
        color: 'D8E5F1',
        size: 5,
        space: 5,
      },
    },
  });
}

function fiscalYearReportDocxSubheading(library, text, options = {}) {
  return fiscalYearReportDocxParagraph(library, text, {
    bold: true,
    color: options.color || FISCAL_YEAR_DOCX.blue,
    size: options.size || 24,
    before: options.before || 0,
    after: options.after ?? 35,
    line: 252,
    keepNext: true,
  });
}

function fiscalYearReportDocxBullet(library, runs) {
  const children = [fiscalYearReportDocxRun(library, '•  ', { size: 20, color: '000000' }), ...(runs || [])];
  return new library.Paragraph({
    children,
    spacing: { before: 0, after: 72, line: 272 },
    indent: { left: 270, hanging: 150 },
  });
}

function fiscalYearReportDocxTable(library, headers, rows, widths, options = {}) {
  const scaledWidths = fiscalYearReportDocxScaleWidths(widths);
  const tableWidth = scaledWidths.reduce((sum, value) => sum + value, 0);
  const borders = fiscalYearReportDocxBorders(library, options.borderColor || FISCAL_YEAR_DOCX.grid);
  const outputRows = [];

  if (headers?.length) {
    outputRows.push(new library.TableRow({
      cantSplit: true,
      tableHeader: true,
      children: headers.map((header, index) => fiscalYearReportDocxCell(
        library,
        fiscalYearReportDocxCellParagraph(library, header, {
          align: 'center', bold: true, color: FISCAL_YEAR_DOCX.white, size: options.headerSize || 16,
        }),
        {
          width: scaledWidths[index], fill: FISCAL_YEAR_DOCX.navy, borders,
          marginTop: Math.max(62, options.headerMargin ?? 45),
          marginBottom: Math.max(62, options.headerMargin ?? 45),
        },
      )),
    }));
  }

  (rows || []).forEach((row, rowIndex) => {
    const rowData = Array.isArray(row) ? { cells: row } : row;
    const isTotal = Boolean(rowData.total);
    const fill = rowData.fill || (isTotal
      ? FISCAL_YEAR_DOCX.total
      : (options.alternate && rowIndex % 2 === 1 ? FISCAL_YEAR_DOCX.light : FISCAL_YEAR_DOCX.white));
    const totalTop = isTotal ? fiscalYearReportDocxBorder(library, FISCAL_YEAR_DOCX.lineBlue, 8) : null;

    outputRows.push(new library.TableRow({
      cantSplit: true,
      children: scaledWidths.map((width, cellIndex) => {
        const rawCell = rowData.cells?.[cellIndex];
        const cell = rawCell && typeof rawCell === 'object' && !Array.isArray(rawCell)
          ? rawCell
          : { text: rawCell ?? '' };
        const cellBorders = totalTop ? {
          top: totalTop,
          bottom: fiscalYearReportDocxBorder(library, FISCAL_YEAR_DOCX.grid, 1),
          left: fiscalYearReportDocxBorder(library, FISCAL_YEAR_DOCX.grid, 1),
          right: fiscalYearReportDocxBorder(library, FISCAL_YEAR_DOCX.grid, 1),
        } : borders;
        return fiscalYearReportDocxCell(library,
          fiscalYearReportDocxCellParagraph(library, cell.text, {
            align: cell.align || (cellIndex === 0 ? 'left' : 'right'),
            bold: Boolean(cell.bold || isTotal),
            italic: Boolean(cell.italic),
            color: cell.color || FISCAL_YEAR_DOCX.text,
            size: cell.size || options.fontSize || 18,
            line: cell.line || 248,
            segments: cell.segments,
          }),
          {
            width,
            fill: cell.fill || fill,
            borders: cellBorders,
            marginTop: Math.max(66, cell.marginTop ?? options.cellMargin ?? 45),
            marginBottom: Math.max(66, cell.marginBottom ?? options.cellMargin ?? 45),
          });
      }),
    }));
  });

  return new library.Table({
    width: { size: tableWidth, type: library.WidthType.DXA },
    columnWidths: scaledWidths,
    rows: outputRows,
    layout: library.TableLayoutType.FIXED,
    borders,
  });
}

function fiscalYearReportDocxKpiTable(library, reportData) {
  const summary = reportData.summary;
  const metrics = [
    {
      value: fiscalYearReportCurrency(summary.localRevenueCapacity, false),
      label: 'Maximum Revenue Capacity\n(Based on local rates)',
    },
    {
      value: fiscalYearReportCurrency(summary.intrasourcingRevenueCapacity, false),
      label: 'Maximum Revenue Capacity\n(Based on Intra rates)',
    },
    {
      value: fiscalYearReportDays(summary.availableCapacityDays, 'days'),
      label: 'Available capacity',
    },
    {
      value: fiscalYearReportCompactCurrency(summary.committedTarget),
      label: 'Committed target',
    },
  ];
  const widths = fiscalYearReportDocxScaleWidths([2436, 2436, 2437, 2437]);
  const borders = fiscalYearReportDocxBorders(library, 'D4E1EF');
  return new library.Table({
    width: { size: FISCAL_YEAR_DOCX.usableWidth, type: library.WidthType.DXA },
    columnWidths: widths,
    layout: library.TableLayoutType.FIXED,
    borders,
    rows: [
      new library.TableRow({
        cantSplit: true,
        children: metrics.map((metric, index) => fiscalYearReportDocxCell(library,
          fiscalYearReportDocxCellParagraph(library, metric.value, {
            align: 'center', bold: true, size: 31, color: index === 1 ? '000000' : FISCAL_YEAR_DOCX.navy,
          }),
          { width: widths[index], fill: FISCAL_YEAR_DOCX.light, borders, marginTop: 105, marginBottom: 90 })),
      }),
      new library.TableRow({
        cantSplit: true,
        children: metrics.map((metric, index) => fiscalYearReportDocxCell(library,
          fiscalYearReportDocxCellParagraph(library, metric.label, {
            align: 'center', size: 15, color: FISCAL_YEAR_DOCX.muted, line: 205,
          }),
          { width: widths[index], fill: FISCAL_YEAR_DOCX.light, borders, marginTop: 75, marginBottom: 90 })),
      }),
    ],
  });
}

function fiscalYearReportDataUrlBytes(dataUrl) {
  const base64 = String(dataUrl || '').split(',')[1] || '';
  if (!base64) return null;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function fiscalYearReportDocxLegend(library, legend) {
  const rows = (legend || []).map(item => new library.TableRow({
    cantSplit: true,
    children: [
      fiscalYearReportDocxCell(library, fiscalYearReportDocxCellParagraph(library, ' ', { size: 6 }), {
        width: 260,
        fill: item.color,
        borderless: true,
        marginTop: 30,
        marginRight: 20,
        marginBottom: 30,
        marginLeft: 20,
      }),
      fiscalYearReportDocxCell(library, fiscalYearReportDocxCellParagraph(library, item.label, { size: 17 }), {
        width: 1780,
        borderless: true,
        marginTop: 24,
        marginBottom: 24,
      }),
      fiscalYearReportDocxCell(library, fiscalYearReportDocxCellParagraph(library, item.value, {
        size: 17, bold: true, align: 'right',
      }), {
        width: 700,
        borderless: true,
        marginTop: 24,
        marginBottom: 24,
      }),
    ],
  }));

  return new library.Table({
    width: { size: 2740, type: library.WidthType.DXA },
    columnWidths: [260, 1780, 700],
    rows,
    layout: library.TableLayoutType.FIXED,
    borders: {
      top: fiscalYearReportDocxNoBorder(library),
      bottom: fiscalYearReportDocxNoBorder(library),
      left: fiscalYearReportDocxNoBorder(library),
      right: fiscalYearReportDocxNoBorder(library),
      insideHorizontal: fiscalYearReportDocxNoBorder(library),
      insideVertical: fiscalYearReportDocxNoBorder(library),
    },
  });
}

function fiscalYearReportDocxPageOne(library, reportData) {
  const chartBytes = fiscalYearReportDataUrlBytes(reportData.chartImage);
  const chartChildren = [];
  if (chartBytes) {
    chartChildren.push(new library.Paragraph({
      alignment: library.AlignmentType.CENTER,
      spacing: { before: 0, after: 0 },
      children: [new library.ImageRun({
        type: 'png',
        data: chartBytes,
        // Square display dimensions intentionally preserve the doughnut circle.
        transformation: { width: 315, height: 315 },
        altText: {
          title: 'Capacity Allocation',
          description: 'Capacity Allocation doughnut chart for the selected Matrix fiscal year.',
          name: 'Capacity Allocation chart',
        },
      })],
    }));
  } else {
    chartChildren.push(fiscalYearReportDocxParagraph(library, 'Capacity Allocation chart unavailable.', {
      size: 18, color: FISCAL_YEAR_DOCX.muted, align: 'center', after: 0,
    }));
  }

  const chartWidths = fiscalYearReportDocxScaleWidths([6500, 3246]);
  const chartLayout = new library.Table({
    width: { size: FISCAL_YEAR_DOCX.usableWidth, type: library.WidthType.DXA },
    columnWidths: chartWidths,
    layout: library.TableLayoutType.FIXED,
    borders: {
      top: fiscalYearReportDocxNoBorder(library), bottom: fiscalYearReportDocxNoBorder(library),
      left: fiscalYearReportDocxNoBorder(library), right: fiscalYearReportDocxNoBorder(library),
      insideHorizontal: fiscalYearReportDocxNoBorder(library), insideVertical: fiscalYearReportDocxNoBorder(library),
    },
    rows: [new library.TableRow({
      cantSplit: true,
      children: [
        fiscalYearReportDocxCell(library, chartChildren, {
          width: chartWidths[0], borderless: true, marginTop: 0, marginRight: 60, marginBottom: 0, marginLeft: 0,
        }),
        fiscalYearReportDocxCell(library, fiscalYearReportDocxLegend(library, reportData.legend), {
          width: chartWidths[1], borderless: true, vertical: library.VerticalAlign.CENTER,
          marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 110,
        }),
      ],
    })],
  });

  return [
    fiscalYearReportDocxParagraph(library, `${reportData.compactFyLabel} Professional Services`, {
      bold: true, color: FISCAL_YEAR_DOCX.navy, size: 46, after: 0, line: 225,
    }),
    fiscalYearReportDocxParagraph(library, 'Capacity & Revenue Forecast', {
      bold: true, color: FISCAL_YEAR_DOCX.navy, size: 46, after: 30, line: 225,
    }),
    fiscalYearReportDocxParagraph(library, 'Final management planning report | Fiscal year: April to March', {
      color: FISCAL_YEAR_DOCX.muted, size: 21, after: 470, line: 260,
    }),
    fiscalYearReportDocxKpiTable(library, reportData),
    fiscalYearReportDocxSpacer(library, 520),
    chartLayout,
    fiscalYearReportDocxParagraph(library, reportData.chartCaption, {
      bold: true, italic: true, color: FISCAL_YEAR_DOCX.navy, size: 17, align: 'center', before: 80, after: 530,
    }),
    fiscalYearReportDocxParagraph(library, reportData.planningBasis, {
      color: FISCAL_YEAR_DOCX.muted, size: 21, after: 0, line: 285,
    }),
  ];
}

function fiscalYearReportDocxExecutiveRows(reportData) {
  const summary = reportData.summary;
  const rows = typeof getExecutiveMatrixRows === 'function'
    ? getExecutiveMatrixRows(summary)
    : [];

  return rows.map(row => ({
    cells: [
      row.metricDetail
        ? {
            text: row.metric,
            segments: [
              { text: row.metric, bold: Boolean(row.headline), size: 18 },
              { text: ` ${row.metricDetail}`, bold: false, size: 14, color: FISCAL_YEAR_DOCX.muted },
            ],
          }
        : { text: row.metric, bold: Boolean(row.headline) },
      { text: row.value, bold: true, align: 'right' },
      { text: row.fte, bold: true, align: 'right' },
    ],
  }));
}

function fiscalYearReportDocxPageTwo(library, reportData) {
  const summary = reportData.summary;
  const operatingBullets = [
    [fiscalYearReportDocxRun(library, 'Deliver ', { size: 20 }), fiscalYearReportDocxRun(library, `${fiscalYearReportCompactCurrency(summary.committedTargets?.intrasourcing)} Intra-Sourcing revenue`, { size: 20, bold: true })],
    [fiscalYearReportDocxRun(library, 'Deliver ', { size: 20 }), fiscalYearReportDocxRun(library, `${fiscalYearReportCompactCurrency(summary.committedTargets?.local)} Local PS revenue`, { size: 20, bold: true })],
    [fiscalYearReportDocxRun(library, 'Support additional Training revenue opportunities', { size: 20 })],
    [fiscalYearReportDocxRun(library, 'Maintain strong presales support for future pipeline generation', { size: 20 })],
    [fiscalYearReportDocxRun(library, 'Continue investing in capability development while maintaining operational governance', { size: 20 })],
  ];

  const excludedPhrase = reportData.nonAssignableActiveCount > 0 ? ' (excluding non-assignable management capacity)' : '';
  const intro = `The Professional Services organization consists of ${summary.assignableCount.toLocaleString()} delivery resources${excludedPhrase} supporting Intra-Sourcing, Local Professional Services (PS), Training Delivery, Presales, Skill Development, and General Administration activities.`;

  const availableRows = (summary.availableRows || []).map(row => ({
    cells: [
      row.displayGroup,
      { text: Number(row.fte).toLocaleString('en-US'), align: 'right' },
      { text: row.basis, align: 'center' },
      fiscalYearReportDays(row.days),
    ],
  }));
  availableRows.push({
    total: true,
    cells: [
      'Total Available Capacity',
      summary.assignableCount.toLocaleString('en-US'),
      '',
      fiscalYearReportDays(summary.availableCapacityDays, 'Days'),
    ],
  });

  return [
    fiscalYearReportDocxSectionHeading(library, '1. Executive Matrix'),
    fiscalYearReportDocxParagraph(library, intro, { size: 20, after: 165, line: 268 }),
    fiscalYearReportDocxSubheading(library, `The ${reportData.compactFyLabel} operating model is designed to:`, { size: 23, after: 40 }),
    ...operatingBullets.map(runs => fiscalYearReportDocxBullet(library, runs)),
    fiscalYearReportDocxSubheading(library, 'Executive Metrics', { size: 22, before: 80, after: 35 }),
    fiscalYearReportDocxTable(library,
      ['Metric', 'Value', 'FTE'],
      fiscalYearReportDocxExecutiveRows(reportData),
      [5450, 2550, 1746],
      { alternate: true, headerSize: 17, fontSize: 18, cellMargin: 47 }),
    fiscalYearReportDocxSpacer(library, 105),
    fiscalYearReportDocxSectionHeading(library, '2. Available Capacity Summary', { size: 31, after: 35 }),
    fiscalYearReportDocxTable(library,
      ['Resource Category', 'FTE', 'Availability Basis', 'Available Working Days'],
      availableRows,
      [3200, 1300, 2900, 2346],
      { alternate: true, headerSize: 16, fontSize: 18, cellMargin: 42 }),
  ];
}

function fiscalYearReportDocxMaximumRevenueRows(reportData) {
  const summary = reportData.summary;
  const rows = (summary.availableRows || []).map(row => ({
    cells: [
      row.displayGroup,
      Number(row.fte).toLocaleString('en-US'),
      fiscalYearReportDays(row.days),
      fiscalYearReportRate(row.avgIntraDailyRate),
      fiscalYearReportRate(row.avgLocalDailyRate),
      fiscalYearReportCurrency(row.intraCapacity, true),
      fiscalYearReportCurrency(row.localCapacity, true),
    ],
  }));
  rows.push({
    total: true,
    cells: [
      'Annual Revenue Capacity',
      summary.assignableCount.toLocaleString('en-US'),
      fiscalYearReportDays(summary.availableCapacityDays),
      '',
      '',
      fiscalYearReportCurrency(summary.intrasourcingRevenueCapacity, true),
      fiscalYearReportCurrency(summary.localRevenueCapacity, true),
    ],
  });
  return rows;
}

function fiscalYearReportDocxRevenueGroupRows(reportData) {
  const summary = reportData.summary;
  const rows = (summary.revenueGroupRows || []).map(row => ({
    cells: [
      row.group,
      fiscalYearReportFte(row.fte),
      fiscalYearReportCurrency(row.intrasourcingCapacity, true),
      fiscalYearReportCurrency(row.localCapacity, true),
      fiscalYearReportPercent(row.contribution),
    ],
  }));
  rows.push({
    total: true,
    cells: [
      'Total Annual Revenue Capacity',
      fiscalYearReportFte(summary.equivalentCapacity),
      fiscalYearReportCurrency(summary.intrasourcingRevenueCapacity, true),
      fiscalYearReportCurrency(summary.localRevenueCapacity, true),
      '100%',
    ],
  });
  return rows;
}

function fiscalYearReportDocxRevenueTargetRows(reportData) {
  const rows = reportData.revenueTargets.rows.map(row => ({
    cells: [
      row.label,
      row.explicit ? fiscalYearReportCurrency(row.target, true) : `Matrix capacity opportunity\n${fiscalYearReportCurrency(row.target, true)}`,
      fiscalYearReportRate(row.rate),
      fiscalYearReportDays(row.manDays),
      fiscalYearReportFte(row.fte),
    ],
  }));
  rows.push({
    total: true,
    cells: [
      'Total Revenue Target',
      fiscalYearReportCurrency(reportData.revenueTargets.totalTarget, true),
      '',
      fiscalYearReportDays(reportData.revenueTargets.totalDays),
      `${fiscalYearReportFte(reportData.revenueTargets.totalFte)} FTE`,
    ],
  });
  return rows;
}

function fiscalYearReportDocxPageThree(library, reportData) {
  return [
    fiscalYearReportDocxSectionHeading(library, '3. Maximum Revenue Capacity', { after: 35 }),
    fiscalYearReportDocxTable(library,
      ['Resource Category', 'FTE', 'Available\nWorking Days', 'Rate/Day Intra\n(USD)', 'Rate/Day Local\n(USD)', 'Maximum Revenue Capacity\nIntra-Sourcing (USD)', 'Maximum Revenue Capacity\nLocal (USD)'],
      fiscalYearReportDocxMaximumRevenueRows(reportData),
      [2050, 600, 1150, 1200, 1200, 1773, 1773],
      { alternate: true, headerSize: 14, fontSize: 16, cellMargin: 38, headerMargin: 35 }),
    fiscalYearReportDocxSubheading(library, 'Revenue Capacity by Resource Group', { size: 22, before: 90, after: 35 }),
    fiscalYearReportDocxTable(library,
      ['Resource Group', 'FTE', 'Revenue Capacity\nIntra-Sourcing', 'Revenue Capacity\nLocal', 'Contribution'],
      fiscalYearReportDocxRevenueGroupRows(reportData),
      [2500, 1050, 2350, 2300, 1546],
      { alternate: true, headerSize: 14, fontSize: 17, cellMargin: 40, headerMargin: 35 }),
    fiscalYearReportDocxSpacer(library, 100),
    fiscalYearReportDocxSectionHeading(library, '4. Revenue Targets', { after: 35 }),
    fiscalYearReportDocxTable(library,
      ['Revenue Stream', 'Target', 'Avg. Rate\n(USD/Day)', 'Man Days', 'FTE'],
      fiscalYearReportDocxRevenueTargetRows(reportData),
      [2900, 2400, 1750, 1450, 1246],
      { alternate: true, headerSize: 15, fontSize: 17, cellMargin: 40, headerMargin: 35 }),
  ];
}

function fiscalYearReportDocxCapacityValueRows(reportData) {
  return (reportData.capacityValueRows.billable || []).map(row => ({
    cells: [
      row.label,
      fiscalYearReportPercent(row.share),
      fiscalYearReportFte(row.fte),
      fiscalYearReportCurrency(row.capacityValue, true),
      row.target > 0 ? fiscalYearReportCurrency(row.target, true) : '—',
      fiscalYearReportCurrency(row.realized, true),
      fiscalYearReportCurrency(row.backlog, true),
      fiscalYearReportCurrency(row.remaining, true),
    ],
  }));
}

function fiscalYearReportDocxFunctionRows(reportData) {
  const summary = reportData.summary;
  const rows = (reportData.capacityValueRows.functionRows || []).map(row => ({
    cells: [
      row.label,
      fiscalYearReportPercent(row.share),
      fiscalYearReportFte(row.fte),
      fiscalYearReportCurrency(row.opportunity, true),
      row.target > 0 ? fiscalYearReportCurrency(row.target, true) : '—',
      row.multiplier ? row.multiplier.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—',
      fiscalYearReportCurrency(row.pipeline, true),
      fiscalYearReportCurrency(row.remaining, true),
    ],
  }));
  rows.push({
    total: true,
    cells: [
      'Total',
      fiscalYearReportPercent(summary.allocationMix?.totalAllocationPercentage),
      fiscalYearReportFte(summary.defaultAnnualWorkdays > 0 ? summary.allocationMix.allocatedMandays / summary.defaultAnnualWorkdays : 0),
      fiscalYearReportCurrency(summary.allocationMix?.capacityValue, true),
      '', '', '', '',
    ],
  });
  return rows;
}

function fiscalYearReportDocxPageFour(library, reportData) {
  const summary = reportData.summary;

  return [
    fiscalYearReportDocxSectionHeading(library, '5. Capacity Value Allocation', { after: 170 }),
    fiscalYearReportDocxParagraph(library,
      `The allocation below applies the approved capacity percentages to the total annual capability value of ${fiscalYearReportCurrency(summary.allocationMix?.capacityValue, true)}.`,
      { size: 18, after: 190, line: 268 }),
    fiscalYearReportDocxTable(library,
      ['Billable Utilization', 'Capacity %', 'FTE', 'Capacity Value\n(USD)', 'Target\n(USD)', 'Realized\n(USD)', 'Backlog\n(USD)', 'Remaining\n(USD)'],
      fiscalYearReportDocxCapacityValueRows(reportData),
      [1700, 1050, 820, 1450, 1200, 1200, 1200, 1126],
      { alternate: true, headerSize: 13, fontSize: 16, cellMargin: 38, headerMargin: 32 }),
    fiscalYearReportDocxSpacer(library, 20),
    fiscalYearReportDocxTable(library,
      ['Function', 'Capacity %', 'FTE', 'Opportunity Value\n(USD)', 'Target\n(USD)', 'Multiplier', 'Pipeline\n(USD)', 'Remaining\n(USD)'],
      fiscalYearReportDocxFunctionRows(reportData),
      [1700, 1050, 820, 1450, 1200, 1200, 1200, 1126],
      { alternate: true, headerSize: 13, fontSize: 16, cellMargin: 38, headerMargin: 32 }),
  ];
}


function fiscalYearReportDocxPipelineTargetRows(reportData) {
  const notes = reportData.pipelineNotes;
  return [
    { cells: ['Local Pipeline Target', fiscalYearReportCurrency(notes.localPipelineTarget, true)] },
    { cells: ['Pipeline Multiplier', notes.multiplier.toLocaleString('en-US', { maximumFractionDigits: 2 })] },
    { cells: ['Base Pipeline Requirement', fiscalYearReportCurrency(notes.baseRequirement, true)] },
    { cells: ['Probable Realized This FY', fiscalYearReportCurrency(notes.probableRealizedThisFY, true)] },
    { cells: ['Local Target Next FY', fiscalYearReportCurrency(notes.localTargetNextFY, true)] },
    { cells: ['Already Working With', fiscalYearReportCurrency(notes.alreadyWorkingWith, true)] },
    {
      cells: [
        'Secured',
        `≥ ${fiscalYearReportPercent(notes.securedMinPercent)} · ${fiscalYearReportCurrency(notes.securedAmount, true)}`,
      ],
    },
    {
      cells: [
        'Best Case',
        `≥ ${fiscalYearReportPercent(notes.bestCaseMinPercent)} · ${fiscalYearReportCurrency(notes.bestCaseAmount, true)}`,
      ],
    },
    {
      cells: [
        'Prospect',
        `< ${fiscalYearReportPercent(notes.bestCaseMinPercent)} · ${fiscalYearReportCurrency(notes.prospectAmount, true)}`,
      ],
    },
    {
      total: true,
      cells: [
        'Pipeline Gap',
        fiscalYearReportCurrency(notes.pipelineGap, true),
      ],
    },
  ];
}

function fiscalYearReportDocxPageFive(library, reportData) {
  const summary = reportData.summary;
  return [
    fiscalYearReportDocxSectionHeading(library, '6. Pipeline Target Summary', { before: 240, after: 150 }),
    fiscalYearReportDocxParagraph(library,
      `Forward pipeline planning for ${reportData.compactFyLabel} using the saved Local Pipeline Target, config.js planning values, and current Pre-Sale Product confidence thresholds (Secured ≥ ${fiscalYearReportPercent(summary.preSalePipeline?.securedMinPercent)}, Best Case ≥ ${fiscalYearReportPercent(summary.preSalePipeline?.bestCaseMinPercent)}).`,
      { size: 18, after: 190, line: 268 }),
    fiscalYearReportDocxTable(library,
      ['Planning Metric', 'Value'],
      fiscalYearReportDocxPipelineTargetRows(reportData),
      [5650, 4096],
      { alternate: true, headerSize: 17, fontSize: 19, cellMargin: 70, headerMargin: 68 }),
  ];
}

function fiscalYearReportDocxFooter(library, reportData) {
  const noBorder = fiscalYearReportDocxNoBorder(library);
  const topBorder = fiscalYearReportDocxBorder(library, 'D8E5F1', 4);
  const footerWidths = fiscalYearReportDocxScaleWidths([8000, 1746]);
  const leftCell = new library.TableCell({
    width: { size: footerWidths[0], type: library.WidthType.DXA },
    children: [fiscalYearReportDocxCellParagraph(library,
      `${reportData.compactFyLabel} Professional Services Capacity & Revenue Forecast (Final)`,
      { size: 13, color: FISCAL_YEAR_DOCX.muted })],
    margins: { top: 90, right: 20, bottom: 0, left: 0 },
    borders: { top: topBorder, bottom: noBorder, left: noBorder, right: noBorder },
  });

  const pageChildren = [
    fiscalYearReportDocxRun(library, 'Page ', { size: 13, color: FISCAL_YEAR_DOCX.muted }),
    library.PageNumber.CURRENT,
  ];
  const rightCell = new library.TableCell({
    width: { size: footerWidths[1], type: library.WidthType.DXA },
    children: [new library.Paragraph({
      alignment: library.AlignmentType.RIGHT,
      spacing: { before: 0, after: 0 },
      children: pageChildren,
    })],
    margins: { top: 90, right: 0, bottom: 0, left: 20 },
    borders: { top: topBorder, bottom: noBorder, left: noBorder, right: noBorder },
  });

  return new library.Footer({
    children: [new library.Table({
      width: { size: FISCAL_YEAR_DOCX.usableWidth, type: library.WidthType.DXA },
      columnWidths: footerWidths,
      rows: [new library.TableRow({ children: [leftCell, rightCell] })],
      layout: library.TableLayoutType.FIXED,
      borders: {
        top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
        insideHorizontal: noBorder, insideVertical: noBorder,
      },
    })],
  });
}

function fiscalYearReportDocxPageBreak(library) {
  return new library.Paragraph({
    children: [new library.PageBreak()],
    spacing: { before: 0, after: 0 },
  });
}

async function buildFiscalYearReportDocx(reportData) {
  const library = fiscalYearReportDocxLibrary();
  const children = [
    ...fiscalYearReportDocxPageOne(library, reportData),
    fiscalYearReportDocxPageBreak(library),
    ...fiscalYearReportDocxPageTwo(library, reportData),
    fiscalYearReportDocxPageBreak(library),
    ...fiscalYearReportDocxPageThree(library, reportData),
    fiscalYearReportDocxPageBreak(library),
    ...fiscalYearReportDocxPageFour(library, reportData),
    ...fiscalYearReportDocxPageFive(library, reportData),
  ];

  const documentFile = new library.Document({
    creator: 'Workforce Allocation Dashboard',
    title: `${reportData.compactFyLabel} Professional Services Capacity & Revenue Forecast`,
    description: 'Professional Services capacity and revenue forecast generated from the selected Matrix fiscal year.',
    sections: [{
      properties: {
        page: {
          size: { width: FISCAL_YEAR_DOCX.pageWidth, height: FISCAL_YEAR_DOCX.pageHeight },
          margin: {
            top: FISCAL_YEAR_DOCX.marginTop,
            right: FISCAL_YEAR_DOCX.marginRight,
            bottom: FISCAL_YEAR_DOCX.marginBottom,
            left: FISCAL_YEAR_DOCX.marginLeft,
            header: FISCAL_YEAR_DOCX.headerDistance,
            footer: FISCAL_YEAR_DOCX.footerDistance,
          },
        },
      },
      footers: { default: fiscalYearReportDocxFooter(library, reportData) },
      children,
    }],
  });

  return library.Packer.toBlob(documentFile);
}

function downloadFiscalYearReportBlob(blob, compactFyLabel) {
  const fileLabel = String(compactFyLabel || 'FY').replace(/\s+/g, '').replace(/[^A-Za-z0-9_-]/g, '');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileLabel}_Professional_Services_Capacity_Revenue_Forecast.docx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function exportFiscalYearReport() {
  if (typeof matrixFiscalYearLoadInProgress !== 'undefined' && matrixFiscalYearLoadInProgress) {
    throw new Error('The selected fiscal year is still loading. Try the export again when the Matrix finishes refreshing.');
  }

  if (document.fonts?.ready) await document.fonts.ready;
  const reportData = collectFiscalYearReportData();
  const docxBlob = await buildFiscalYearReportDocx(reportData);
  downloadFiscalYearReportBlob(docxBlob, reportData.compactFyLabel);
}

function setFiscalYearExportBusy(button, busy) {
  if (!button) return;
  if (busy) {
    button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.innerHTML = `
      <div class="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
        <svg class="w-3.5 h-3.5 text-blue-600 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7"/></svg>
      </div>
      <span class="block leading-snug">Preparing Fiscal Year Report…</span>`;
  } else {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
  }
}

function initFiscalYearReportExport() {
  const exportButton = document.getElementById('exportFiscalYearReportBtn');
  if (!exportButton || exportButton.dataset.exportInit === '1') return;

  exportButton.dataset.exportInit = '1';
  exportButton.addEventListener('click', async event => {
    event.preventDefault();
    event.stopPropagation();
    setFiscalYearExportBusy(exportButton, true);
    try {
      if (typeof toast === 'function') toast('Preparing the fiscal year DOCX report…', 'info');
      await exportFiscalYearReport();
      if (typeof toast === 'function') toast('Fiscal year report exported.', 'success');
    } catch (error) {
      console.error('Fiscal year report export failed.', error);
      if (typeof toast === 'function') toast(error.message || 'Unable to export the fiscal year report.', 'error');
    } finally {
      setFiscalYearExportBusy(exportButton, false);
    }
  });
}
