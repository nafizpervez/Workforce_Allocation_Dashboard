/* Workforce Allocation Dashboard — reports/fiscal-year-report.js
   Exports the selected Matrix fiscal year as a four-page A4 portrait DOCX.

   Important: report text, KPI values and tables are created as native Word
   content. The Capacity Allocation donut is the only graphical element that is
   embedded as an image; dashboard cards/pages are never captured as screenshots. */

const FISCAL_YEAR_EXPORT_CARD_KEYS = Object.freeze({
  capacityAllocation: 'capacity-allocation',
  executiveMatrix: 'executive-metrics',
  availableCapacity: 'available-capacity-summary',
  maximumRevenue: 'maximum-revenue-capacity',
  revenueTargets: 'revenue-targets',
  capacityValue: 'capacity-value-allocation',
  pipelineTarget: 'pipeline-target-summary',
});

const FISCAL_YEAR_DOCX = Object.freeze({
  pageWidth: 11906, // A4 portrait, twentieths of a point
  pageHeight: 16838,
  // Word's Normal margin preset: 1 inch (1,440 twips) on every side.
  marginLeft: 1440,
  marginRight: 1440,
  marginTop: 1440,
  marginBottom: 1440,
  usableWidth: 9026,
  blue: '1F4E78',
  darkBlue: '173A67',
  accentBlue: '2563EB',
  lightBlue: 'EAF2FB',
  lighterBlue: 'F5F8FC',
  border: 'C8D5E5',
  text: '0F172A',
  muted: '64748B',
  greenFill: 'ECFDF3',
  greenText: '047857',
  redFill: 'FFF1F2',
  redText: 'BE123C',
});

function getFiscalYearExportCard(cardKey) {
  return document.querySelector(`.dc[data-card-key="${cardKey}"]`);
}

function getFiscalYearExportChartImage() {
  try {
    // Export the donut as a high-resolution PNG while keeping the dashboard's
    // surrounding report content as native Word text/tables.  Word displays the
    // chart at roughly 3.7 inches wide, so a 4x raster copy provides ample pixel
    // density for screen viewing, zooming and normal office printing.
    const chart = S.charts?.capacityAllocationExecutive;
    const sourceCanvas = chart?.canvas || document.getElementById('capacityAllocationExecutiveChart');
    if (!sourceCanvas || typeof sourceCanvas.toDataURL !== 'function') return null;

    const sourceWidth = Math.max(1, Number(sourceCanvas.width) || Number(sourceCanvas.clientWidth) || 1);
    const sourceHeight = Math.max(1, Number(sourceCanvas.height) || Number(sourceCanvas.clientHeight) || 1);
    const scale = 4;
    const targetCanvas = document.createElement('canvas');
    targetCanvas.width = Math.round(sourceWidth * scale);
    targetCanvas.height = Math.round(sourceHeight * scale);

    const context = targetCanvas.getContext('2d');
    if (!context) {
      const fallback = sourceCanvas.toDataURL('image/png', 1);
      return fallback?.startsWith('data:image/') ? fallback : null;
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
    context.drawImage(sourceCanvas, 0, 0, targetCanvas.width, targetCanvas.height);

    const dataUrl = targetCanvas.toDataURL('image/png', 1);
    return dataUrl?.startsWith('data:image/') ? dataUrl : null;
  } catch (error) {
    console.warn('Unable to capture the Capacity Allocation chart for the fiscal-year report.', error);
    return null;
  }
}

function fiscalYearReportXmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fiscalYearReportNormalizeText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function fiscalYearReportElementText(element) {
  if (!element) return '';
  const parts = [];
  element.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = fiscalYearReportNormalizeText(node.nodeValue);
      if (text) parts.push(text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.tagName === 'BR') {
      parts.push('\n');
      return;
    }
    const text = fiscalYearReportElementText(node);
    if (text) parts.push(text);
  });
  return fiscalYearReportNormalizeText(parts.join(' '));
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


const FISCAL_YEAR_CAPACITY_LEGEND_COLOR_MAP = Object.freeze({
  'Intra-Sourcing': '377CB7',
  'Local PS': '2A9D8F',
  'Training Delivery': 'F2B51D',
  'Pre Sale': '8061A6',
  'Pre-Sale': '8061A6',
  'Presales': '8061A6',
  'Skill Development': '6EAF45',
  'General Admin': '5A9BD5',
});

function fiscalYearReportLegendColor(label, fallback) {
  const normalized = String(label || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const exact = Object.entries(FISCAL_YEAR_CAPACITY_LEGEND_COLOR_MAP)
    .find(([key]) => key.toLowerCase().replace(/[^a-z0-9]+/g, ' ') === normalized);
  if (exact) return exact[1];
  return fallback || '94A3B8';
}

function fiscalYearReportExtractColumnPercentages(table, columnCount) {
  const cols = [...(table?.querySelectorAll(':scope > colgroup > col') || [])];
  if (cols.length === columnCount) {
    const values = cols.map(col => Number.parseFloat(col.style.width || col.getAttribute('width') || ''));
    const total = values.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
    if (total > 0 && values.every(value => Number.isFinite(value) && value > 0)) {
      return values.map(value => value / total);
    }
  }

  if (columnCount === 2) return [0.58, 0.42];
  if (columnCount === 3) return [0.5, 0.27, 0.23];
  if (columnCount === 4) return [0.34, 0.15, 0.27, 0.24];
  if (columnCount === 5) return [0.28, 0.2, 0.18, 0.17, 0.17];
  if (columnCount === 6) return [0.27, 0.09, 0.13, 0.16, 0.16, 0.19];
  if (columnCount === 8) return [0.22, 0.1, 0.08, 0.15, 0.11, 0.11, 0.11, 0.12];
  return Array.from({ length: columnCount }, () => 1 / Math.max(1, columnCount));
}

function fiscalYearReportExtractTable(table) {
  const rows = [...table.querySelectorAll(':scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr')]
    .map(row => ({
      isHeader: row.parentElement?.tagName === 'THEAD',
      isTotal: row.classList.contains('capacity-executive-table__total'),
      isHeadline: row.classList.contains('capacity-executive-table__row--headline'),
      cells: [...row.cells].map(cell => ({
        text: fiscalYearReportElementText(cell),
        align: cell.classList.contains('capacity-executive-table__center')
          ? 'center'
          : (cell.cellIndex === 0 ? 'left' : 'right'),
      })),
    }))
    .filter(row => row.cells.length);

  const columnCount = rows.reduce((max, row) => Math.max(max, row.cells.length), 0);
  return {
    type: 'table',
    rows,
    columnCount,
    columnFractions: fiscalYearReportExtractColumnPercentages(table, columnCount),
  };
}

function fiscalYearReportExtractCardSections(card) {
  const root = card.querySelector(':scope > .card-expandable-content') || card;
  const sections = [];

  function visit(element) {
    if (!(element instanceof Element)) return;

    if (element.matches('.capacity-financial-strip, .capacity-allocation-visual')) return;
    if (element.tagName === 'TABLE') {
      sections.push(fiscalYearReportExtractTable(element));
      return;
    }
    if (element.matches('.capacity-subtable-title')) {
      const text = fiscalYearReportElementText(element);
      if (text) sections.push({ type: 'subheading', text });
      return;
    }
    if (element.matches('p.capacity-table-intro, p.capacity-table-footnote')) {
      const text = fiscalYearReportElementText(element);
      if (text) sections.push({ type: 'paragraph', text, footnote: element.classList.contains('capacity-table-footnote') });
      return;
    }
    if (element.matches('.capacity-executive-note')) {
      const items = [...element.querySelectorAll('.capacity-executive-note__item')].map(item => ({
        label: fiscalYearReportElementText(item.querySelector('.capacity-executive-note__label')),
        value: fiscalYearReportElementText(item.querySelector('.capacity-executive-note__value')),
      })).filter(item => item.label || item.value);
      if (items.length) sections.push({ type: 'notes', items });
      return;
    }
    if (element.matches('.capacity-pipeline-gap')) {
      sections.push({
        type: 'gap',
        label: fiscalYearReportElementText(element.querySelector('span')) || 'Pipeline gap',
        value: fiscalYearReportElementText(element.querySelector('strong')),
        positive: element.classList.contains('is-positive'),
      });
      return;
    }

    [...element.children].forEach(visit);
  }

  visit(root);
  return sections;
}

function fiscalYearReportExtractCard(cardKey) {
  const card = getFiscalYearExportCard(cardKey);
  if (!card) throw new Error('A required capacity-planning card is not available.');
  return {
    key: cardKey,
    title: fiscalYearReportElementText(card.querySelector('.capacity-executive-card__title')) || card.dataset.cardTitle || '',
    eyebrow: fiscalYearReportElementText(card.querySelector('.capacity-executive-card__eyebrow')),
    subtitle: fiscalYearReportElementText(card.querySelector('.capacity-executive-card__subtitle')),
    fiscalYear: fiscalYearReportElementText(card.querySelector('.capacity-executive-card__fy')),
    sections: fiscalYearReportExtractCardSections(card),
  };
}

function fiscalYearReportExtractCapacityPage() {
  const card = getFiscalYearExportCard(FISCAL_YEAR_EXPORT_CARD_KEYS.capacityAllocation);
  if (!card) throw new Error('Capacity Allocation is still loading.');

  const metrics = [...card.querySelectorAll('.capacity-financial-metric')].map(metric => ({
    value: fiscalYearReportElementText(metric.querySelector('.capacity-financial-metric__value')),
    label: fiscalYearReportElementText(metric.querySelector('.capacity-financial-metric__label')),
  }));

  const legend = [...card.querySelectorAll('.capacity-allocation-legend__item')].map(item => {
    const label = fiscalYearReportElementText(item.querySelector('.capacity-allocation-legend__label'));
    const inlineColor = fiscalYearReportColorToHex(item.querySelector('.capacity-allocation-legend__swatch')?.style?.background);
    return {
      label,
      value: fiscalYearReportElementText(item.querySelector('.capacity-allocation-legend__value')),
      color: fiscalYearReportLegendColor(label, inlineColor),
    };
  });

  return {
    title: fiscalYearReportElementText(card.querySelector('.capacity-executive-card__title')) || 'Capacity Allocation',
    eyebrow: fiscalYearReportElementText(card.querySelector('.capacity-executive-card__eyebrow')),
    subtitle: fiscalYearReportElementText(card.querySelector('.capacity-executive-card__subtitle')),
    fiscalYear: fiscalYearReportElementText(card.querySelector('.capacity-executive-card__fy')),
    metrics,
    legend,
    chartImage: getFiscalYearExportChartImage(),
    chartCaption: fiscalYearReportElementText(card.querySelector('.capacity-allocation-chart-caption')),
  };
}

function collectFiscalYearReportData() {
  const requiredKeys = Object.values(FISCAL_YEAR_EXPORT_CARD_KEYS);
  const missingCards = requiredKeys.filter(cardKey => !getFiscalYearExportCard(cardKey));
  if (missingCards.length) throw new Error('The capacity-planning cards are still loading. Try the export again in a moment.');

  const fiscalYearLabel = typeof fiscalYearDisplayLabel === 'function'
    ? fiscalYearDisplayLabel(S.matrixFiscalYear)
    : `FY ${Number(S.matrixFiscalYear) + 1}`;
  const fiscalYearRange = typeof fiscalYearRangeLabel === 'function'
    ? fiscalYearRangeLabel(S.matrixFiscalYear)
    : '';

  return {
    fiscalYearLabel,
    fiscalYearRange,
    capacity: fiscalYearReportExtractCapacityPage(),
    executive: fiscalYearReportExtractCard(FISCAL_YEAR_EXPORT_CARD_KEYS.executiveMatrix),
    available: fiscalYearReportExtractCard(FISCAL_YEAR_EXPORT_CARD_KEYS.availableCapacity),
    maximumRevenue: fiscalYearReportExtractCard(FISCAL_YEAR_EXPORT_CARD_KEYS.maximumRevenue),
    revenueTargets: fiscalYearReportExtractCard(FISCAL_YEAR_EXPORT_CARD_KEYS.revenueTargets),
    capacityValue: fiscalYearReportExtractCard(FISCAL_YEAR_EXPORT_CARD_KEYS.capacityValue),
    pipelineTarget: fiscalYearReportExtractCard(FISCAL_YEAR_EXPORT_CARD_KEYS.pipelineTarget),
  };
}

function fiscalYearReportDocxLibrary() {
  const library = typeof window !== 'undefined' ? window.docx : null;
  if (!library?.Document || !library?.Packer || !library?.Paragraph || !library?.Table) {
    throw new Error('The Word report generator library is unavailable. Refresh the page and try again.');
  }
  return library;
}

function fiscalYearReportDocxAlignment(library, value) {
  if (value === 'center') return library.AlignmentType.CENTER;
  if (value === 'right') return library.AlignmentType.RIGHT;
  return library.AlignmentType.LEFT;
}

function fiscalYearReportDocxRuns(library, text, options = {}) {
  const value = String(text ?? '');
  const lines = value.split('\n');
  return lines.map((line, index) => new library.TextRun({
    text: line,
    bold: Boolean(options.bold),
    italics: Boolean(options.italic),
    color: options.color || FISCAL_YEAR_DOCX.text,
    size: options.size || 18,
    font: options.font || 'Arial',
    break: index ? 1 : undefined,
  }));
}

function fiscalYearReportDocxParagraph(library, text, options = {}) {
  return new library.Paragraph({
    children: fiscalYearReportDocxRuns(library, text, options),
    alignment: fiscalYearReportDocxAlignment(library, options.align || 'left'),
    spacing: {
      before: Number(options.before) || 0,
      after: options.after === undefined ? 80 : Number(options.after) || 0,
      line: Number(options.line) || 240,
    },
    keepNext: Boolean(options.keepNext),
  });
}

function fiscalYearReportDocxSpacer(library, after = 70) {
  return new library.Paragraph({
    children: [new library.TextRun({ text: '', size: 4, font: 'Arial' })],
    spacing: { before: 0, after, line: 80 },
  });
}

function fiscalYearReportDocxBorder(library, color = FISCAL_YEAR_DOCX.border) {
  return { style: library.BorderStyle.SINGLE, size: 1, color };
}

function fiscalYearReportDocxTableBorders(library, color = FISCAL_YEAR_DOCX.border) {
  const edge = fiscalYearReportDocxBorder(library, color);
  return {
    top: edge,
    bottom: edge,
    left: edge,
    right: edge,
    insideHorizontal: edge,
    insideVertical: edge,
  };
}

function fiscalYearReportDocxCell(library, paragraphs, options = {}) {
  return new library.TableCell({
    children: Array.isArray(paragraphs) ? paragraphs : [paragraphs],
    width: options.width ? { size: Math.max(1, Math.round(options.width)), type: library.WidthType.DXA } : undefined,
    shading: options.fill ? { fill: options.fill, color: 'auto', type: library.ShadingType.CLEAR } : undefined,
    verticalAlign: options.vertical || library.VerticalAlign.CENTER,
    margins: {
      top: options.marginTop ?? 55,
      right: options.marginRight ?? 70,
      bottom: options.marginBottom ?? 55,
      left: options.marginLeft ?? 70,
    },
    borders: options.borders ? {
      top: options.borders.top,
      bottom: options.borders.bottom,
      left: options.borders.left,
      right: options.borders.right,
    } : undefined,
  });
}

function fiscalYearReportDocxCellParagraph(library, text, options = {}) {
  return fiscalYearReportDocxParagraph(library, text, {
    align: options.align || 'left',
    bold: Boolean(options.bold),
    italic: Boolean(options.italic),
    color: options.color || FISCAL_YEAR_DOCX.text,
    size: options.size || 16,
    after: 0,
    line: options.line || 205,
  });
}

function fiscalYearReportDocxColumnWidths(tableData, width) {
  const columnCount = tableData.columnCount || tableData.rows?.[0]?.cells?.length || 1;
  const fractions = tableData.columnFractions?.length === columnCount
    ? tableData.columnFractions
    : Array.from({ length: columnCount }, () => 1 / columnCount);
  const widths = fractions.map(fraction => Math.max(300, Math.round(width * fraction)));
  const total = widths.reduce((sum, value) => sum + value, 0);
  widths[widths.length - 1] += width - total;
  return widths;
}

function fiscalYearReportDocxTable(library, tableData, options = {}) {
  const width = options.width || FISCAL_YEAR_DOCX.usableWidth;
  const columnCount = tableData.columnCount || tableData.rows?.[0]?.cells?.length || 1;
  const widths = fiscalYearReportDocxColumnWidths(tableData, width);
  const fontSize = options.fontSize || (columnCount >= 8 ? 13 : columnCount >= 6 ? 14 : columnCount >= 5 ? 15 : 16);
  const borders = fiscalYearReportDocxTableBorders(library, options.borderColor || FISCAL_YEAR_DOCX.border);

  const rows = (tableData.rows || []).map(row => {
    const fill = row.customFill || (row.isHeader ? FISCAL_YEAR_DOCX.blue : (row.isTotal ? FISCAL_YEAR_DOCX.lightBlue : undefined));
    const color = row.customColor || (row.isHeader ? 'FFFFFF' : FISCAL_YEAR_DOCX.text);
    const bold = row.isHeader || row.isTotal || row.isHeadline;
    return new library.TableRow({
      cantSplit: true,
      children: Array.from({ length: columnCount }, (_, index) => {
        const cell = row.cells[index] || { text: '', align: index === 0 ? 'left' : 'right' };
        return fiscalYearReportDocxCell(library,
          fiscalYearReportDocxCellParagraph(library, cell.text, {
            align: row.isHeader ? 'center' : cell.align,
            bold,
            color,
            size: row.isHeader ? Math.max(13, fontSize) : fontSize,
          }),
          { width: widths[index], fill, borders });
      }),
    });
  });

  return new library.Table({
    rows,
    width: { size: width, type: library.WidthType.DXA },
    columnWidths: widths,
    borders,
    layout: library.TableLayoutType.FIXED,
  });
}

function fiscalYearReportDocxCardBlocks(library, card, options = {}) {
  const compact = Boolean(options.compact);
  const blocks = [];
  if (card.eyebrow) blocks.push(fiscalYearReportDocxParagraph(library, card.eyebrow.toUpperCase(), {
    bold: true, color: FISCAL_YEAR_DOCX.accentBlue, size: 12, after: 20, keepNext: true,
  }));
  blocks.push(fiscalYearReportDocxParagraph(library, card.title, {
    bold: true, color: FISCAL_YEAR_DOCX.text, size: compact ? 19 : 20, after: 20, keepNext: true,
  }));
  if (card.subtitle) blocks.push(fiscalYearReportDocxParagraph(library, card.subtitle, {
    color: FISCAL_YEAR_DOCX.muted, size: compact ? 13 : 14, after: 75,
  }));

  (card.sections || []).forEach((section, index) => {
    if (section.type === 'subheading') {
      blocks.push(fiscalYearReportDocxParagraph(library, section.text, {
        bold: true, color: FISCAL_YEAR_DOCX.darkBlue, size: 14, before: index ? 65 : 0, after: 35, keepNext: true,
      }));
    } else if (section.type === 'paragraph') {
      blocks.push(fiscalYearReportDocxParagraph(library, section.text, {
        color: section.footnote ? FISCAL_YEAR_DOCX.muted : FISCAL_YEAR_DOCX.text,
        italic: section.footnote,
        size: section.footnote ? 12 : 13,
        after: 55,
      }));
    } else if (section.type === 'table') {
      blocks.push(fiscalYearReportDocxTable(library, section));
      blocks.push(fiscalYearReportDocxSpacer(library, 40));
    } else if (section.type === 'notes') {
      blocks.push(fiscalYearReportDocxTable(library, {
        columnCount: 2,
        columnFractions: [0.28, 0.72],
        rows: section.items.map(item => ({
          cells: [{ text: item.label, align: 'left' }, { text: item.value, align: 'left' }],
        })),
      }, { fontSize: 13 }));
      blocks.push(fiscalYearReportDocxSpacer(library, 25));
    } else if (section.type === 'gap') {
      const fill = section.positive ? FISCAL_YEAR_DOCX.greenFill : FISCAL_YEAR_DOCX.redFill;
      const color = section.positive ? FISCAL_YEAR_DOCX.greenText : FISCAL_YEAR_DOCX.redText;
      blocks.push(fiscalYearReportDocxTable(library, {
        columnCount: 2,
        columnFractions: [0.55, 0.45],
        rows: [{
          isTotal: true,
          customFill: fill,
          customColor: color,
          cells: [{ text: section.label, align: 'left' }, { text: section.value, align: 'right' }],
        }],
      }, { fontSize: 16 }));
    }
  });

  return blocks;
}

function fiscalYearReportDataUrlBytes(dataUrl) {
  const base64 = String(dataUrl || '').split(',')[1] || '';
  if (!base64) return null;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function fiscalYearReportDocxMetricsTable(library, metrics) {
  const values = [...(metrics || [])];
  while (values.length < 4) values.push({ value: '—', label: '' });
  const cellWidth = Math.floor(FISCAL_YEAR_DOCX.usableWidth / 2);
  const borders = fiscalYearReportDocxTableBorders(library);
  const metricCell = metric => fiscalYearReportDocxCell(library, [
    fiscalYearReportDocxParagraph(library, metric.value, {
      bold: true, size: 22, color: FISCAL_YEAR_DOCX.darkBlue, align: 'center', after: 18,
    }),
    fiscalYearReportDocxParagraph(library, metric.label, {
      size: 11, color: FISCAL_YEAR_DOCX.muted, align: 'center', after: 0,
    }),
  ], {
    width: cellWidth,
    fill: FISCAL_YEAR_DOCX.lighterBlue,
    borders,
    marginTop: 90,
    marginBottom: 90,
  });

  return new library.Table({
    width: { size: FISCAL_YEAR_DOCX.usableWidth, type: library.WidthType.DXA },
    columnWidths: [cellWidth, FISCAL_YEAR_DOCX.usableWidth - cellWidth],
    borders,
    layout: library.TableLayoutType.FIXED,
    rows: [
      new library.TableRow({ cantSplit: true, children: [metricCell(values[0]), metricCell(values[1])] }),
      new library.TableRow({ cantSplit: true, children: [metricCell(values[2]), metricCell(values[3])] }),
    ],
  });
}

function fiscalYearReportDocxLegendTable(library, legend, options = {}) {
  const width = options.width || FISCAL_YEAR_DOCX.usableWidth;
  const fontSize = options.fontSize || 13;
  const swatchWidth = options.swatchWidth || 280;
  const valueWidth = options.valueWidth || Math.max(900, Math.round(width * 0.26));
  const labelWidth = Math.max(1200, width - swatchWidth - valueWidth);
  const rows = (legend || []).map(item => new library.TableRow({
    cantSplit: true,
    children: [
      fiscalYearReportDocxCell(library, fiscalYearReportDocxCellParagraph(library, ' ', { size: 7 }), {
        width: swatchWidth,
        fill: item.color,
        marginTop: 45,
        marginRight: 35,
        marginBottom: 45,
        marginLeft: 35,
      }),
      fiscalYearReportDocxCell(library, fiscalYearReportDocxCellParagraph(library, item.label, { size: fontSize }), {
        width: labelWidth,
      }),
      fiscalYearReportDocxCell(library, fiscalYearReportDocxCellParagraph(library, item.value, { size: fontSize, bold: true, align: 'right' }), {
        width: valueWidth,
      }),
    ],
  }));
  return new library.Table({
    width: { size: width, type: library.WidthType.DXA },
    columnWidths: [swatchWidth, labelWidth, valueWidth],
    rows,
    layout: library.TableLayoutType.FIXED,
  });
}

function fiscalYearReportDocxCapacityBlocks(library, capacity) {
  const blocks = [];
  if (capacity.eyebrow) blocks.push(fiscalYearReportDocxParagraph(library, capacity.eyebrow.toUpperCase(), {
    bold: true, color: FISCAL_YEAR_DOCX.accentBlue, size: 12, after: 20, keepNext: true,
  }));
  blocks.push(fiscalYearReportDocxParagraph(library, capacity.title, {
    bold: true, size: 21, color: FISCAL_YEAR_DOCX.text, after: 20, keepNext: true,
  }));
  if (capacity.subtitle) blocks.push(fiscalYearReportDocxParagraph(library, capacity.subtitle, {
    size: 13, color: FISCAL_YEAR_DOCX.muted, after: 70,
  }));
  blocks.push(fiscalYearReportDocxMetricsTable(library, capacity.metrics));
  blocks.push(fiscalYearReportDocxSpacer(library, 75));

  const chartBytes = fiscalYearReportDataUrlBytes(capacity.chartImage);
  const leftWidth = 5200;
  const rightWidth = FISCAL_YEAR_DOCX.usableWidth - leftWidth;
  const chartCellChildren = [];

  if (chartBytes) {
    chartCellChildren.push(new library.Paragraph({
      alignment: library.AlignmentType.CENTER,
      spacing: { before: 0, after: capacity.chartCaption ? 20 : 0 },
      children: [new library.ImageRun({
        type: 'png',
        data: chartBytes,
        transformation: { width: 380, height: 250 },
        altText: {
          title: 'Capacity Allocation',
          description: 'Capacity Allocation doughnut chart for the selected fiscal year.',
          name: 'Capacity Allocation chart',
        },
      })],
    }));
  } else {
    chartCellChildren.push(fiscalYearReportDocxParagraph(library, 'Capacity Allocation chart unavailable.', {
      size: 14, color: FISCAL_YEAR_DOCX.muted, align: 'center', after: 15,
    }));
  }

  if (capacity.chartCaption) chartCellChildren.push(fiscalYearReportDocxParagraph(library, capacity.chartCaption, {
    italic: true, size: 11, color: FISCAL_YEAR_DOCX.muted, align: 'center', after: 0,
  }));

  const sideBySide = new library.Table({
    width: { size: FISCAL_YEAR_DOCX.usableWidth, type: library.WidthType.DXA },
    columnWidths: [leftWidth, rightWidth],
    layout: library.TableLayoutType.FIXED,
    borders: {
      top: { style: library.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      bottom: { style: library.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left: { style: library.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right: { style: library.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideHorizontal: { style: library.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideVertical: { style: library.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    },
    rows: [new library.TableRow({
      cantSplit: true,
      children: [
        fiscalYearReportDocxCell(library, chartCellChildren, {
          width: leftWidth,
          marginTop: 20,
          marginRight: 80,
          marginBottom: 20,
          marginLeft: 20,
          borders: {
            top: { style: library.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            bottom: { style: library.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            left: { style: library.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            right: { style: library.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          },
        }),
        fiscalYearReportDocxCell(library, fiscalYearReportDocxLegendTable(library, capacity.legend, {
          width: rightWidth - 100,
          fontSize: 13,
          swatchWidth: 260,
          valueWidth: 980,
        }), {
          width: rightWidth,
          marginTop: 30,
          marginRight: 10,
          marginBottom: 20,
          marginLeft: 10,
          vertical: library.VerticalAlign.CENTER,
          borders: {
            top: { style: library.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            bottom: { style: library.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            left: { style: library.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            right: { style: library.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          },
        }),
      ],
    })],
  });

  blocks.push(sideBySide);
  return blocks;
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
    ...fiscalYearReportDocxCapacityBlocks(library, reportData.capacity),
    fiscalYearReportDocxPageBreak(library),
    ...fiscalYearReportDocxCardBlocks(library, reportData.executive),
    fiscalYearReportDocxSpacer(library, 95),
    ...fiscalYearReportDocxCardBlocks(library, reportData.available),
    fiscalYearReportDocxPageBreak(library),
    ...fiscalYearReportDocxCardBlocks(library, reportData.maximumRevenue, { compact: true }),
    fiscalYearReportDocxSpacer(library, 95),
    ...fiscalYearReportDocxCardBlocks(library, reportData.revenueTargets, { compact: true }),
    fiscalYearReportDocxPageBreak(library),
    ...fiscalYearReportDocxCardBlocks(library, reportData.capacityValue, { compact: true }),
    fiscalYearReportDocxSpacer(library, 95),
    ...fiscalYearReportDocxCardBlocks(library, reportData.pipelineTarget, { compact: true }),
  ];

  const documentFile = new library.Document({
    creator: 'Workforce Allocation Dashboard',
    title: `Workforce Allocation Fiscal Year Report - ${reportData.fiscalYearLabel}`,
    description: 'Fiscal year capacity planning report generated by the Workforce Allocation Dashboard.',
    sections: [{
      properties: {
        page: {
          size: {
            width: FISCAL_YEAR_DOCX.pageWidth,
            height: FISCAL_YEAR_DOCX.pageHeight,
          },
          margin: {
            top: FISCAL_YEAR_DOCX.marginTop,
            right: FISCAL_YEAR_DOCX.marginRight,
            bottom: FISCAL_YEAR_DOCX.marginBottom,
            left: FISCAL_YEAR_DOCX.marginLeft,
            header: 720,
            footer: 720,
          },
        },
      },
      children,
    }],
  });

  return library.Packer.toBlob(documentFile);
}

function downloadFiscalYearReportBlob(blob, fiscalYearLabel) {
  const fileLabel = String(fiscalYearLabel || 'FY').replace(/\s+/g, '_').replace(/[^A-Za-z0-9_-]/g, '');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Workforce_Allocation_Fiscal_Year_Report_${fileLabel}.docx`;
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
  downloadFiscalYearReportBlob(docxBlob, reportData.fiscalYearLabel);
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
  const menuButton = document.getElementById('exportMenuBtn');
  const menu = document.getElementById('exportMenu');
  const exportButton = document.getElementById('exportFiscalYearReportBtn');
  if (!menuButton || !menu || !exportButton || menuButton.dataset.exportInit === '1') return;

  menuButton.dataset.exportInit = '1';
  const closeMenu = () => {
    menu.classList.add('hidden');
    menuButton.setAttribute('aria-expanded', 'false');
  };

  menuButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    const shouldOpen = menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !shouldOpen);
    menuButton.setAttribute('aria-expanded', String(shouldOpen));
  });

  menu.addEventListener('click', event => event.stopPropagation());
  document.addEventListener('click', closeMenu);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMenu();
  });

  exportButton.addEventListener('click', async event => {
    event.preventDefault();
    event.stopPropagation();
    closeMenu();
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
