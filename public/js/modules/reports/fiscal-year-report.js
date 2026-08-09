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
    const chart = S.charts?.capacityAllocationExecutive;
    if (chart && typeof chart.toBase64Image === 'function') {
      const dataUrl = chart.toBase64Image('image/png', 1);
      if (dataUrl?.startsWith('data:image/')) return dataUrl;
    }
    const canvas = document.getElementById('capacityAllocationExecutiveChart');
    const dataUrl = canvas?.toDataURL?.('image/png', 1);
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

  const legend = [...card.querySelectorAll('.capacity-allocation-legend__item')].map(item => ({
    label: fiscalYearReportElementText(item.querySelector('.capacity-allocation-legend__label')),
    value: fiscalYearReportElementText(item.querySelector('.capacity-allocation-legend__value')),
    color: fiscalYearReportColorToHex(item.querySelector('.capacity-allocation-legend__swatch')?.style?.background),
  }));

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

function fiscalYearReportRunXml(text, options = {}) {
  const {
    bold = false,
    italic = false,
    color = FISCAL_YEAR_DOCX.text,
    size = 18,
    font = 'Arial',
  } = options;
  const segments = String(text ?? '').split('\n');
  const properties = [
    `<w:rFonts w:ascii="${font}" w:hAnsi="${font}"/>`,
    bold ? '<w:b/>' : '',
    italic ? '<w:i/>' : '',
    color ? `<w:color w:val="${color}"/>` : '',
    size ? `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` : '',
  ].join('');
  return segments.map((segment, index) => `${index ? '<w:br/>' : ''}<w:r><w:rPr>${properties}</w:rPr><w:t xml:space="preserve">${fiscalYearReportXmlEscape(segment)}</w:t></w:r>`).join('');
}

function fiscalYearReportParagraphXml(text, options = {}) {
  const {
    bold = false,
    italic = false,
    color = FISCAL_YEAR_DOCX.text,
    size = 18,
    align = 'left',
    before = 0,
    after = 80,
    line = 240,
    keepNext = false,
    pageBreakBefore = false,
  } = options;
  return `<w:p>
    <w:pPr>
      <w:jc w:val="${align}"/>
      <w:spacing w:before="${before}" w:after="${after}" w:line="${line}" w:lineRule="auto"/>
      ${keepNext ? '<w:keepNext/>' : ''}
      ${pageBreakBefore ? '<w:pageBreakBefore/>' : ''}
    </w:pPr>
    ${fiscalYearReportRunXml(text, { bold, italic, color, size })}
  </w:p>`;
}

function fiscalYearReportCellMarginsXml(top = 45, right = 70, bottom = 45, left = 70) {
  return `<w:tcMar><w:top w:w="${top}" w:type="dxa"/><w:right w:w="${right}" w:type="dxa"/><w:bottom w:w="${bottom}" w:type="dxa"/><w:left w:w="${left}" w:type="dxa"/></w:tcMar>`;
}

function fiscalYearReportTableBordersXml(color = FISCAL_YEAR_DOCX.border, size = 5) {
  return `<w:tblBorders>
    <w:top w:val="single" w:sz="${size}" w:color="${color}"/>
    <w:left w:val="single" w:sz="${size}" w:color="${color}"/>
    <w:bottom w:val="single" w:sz="${size}" w:color="${color}"/>
    <w:right w:val="single" w:sz="${size}" w:color="${color}"/>
    <w:insideH w:val="single" w:sz="${size}" w:color="${color}"/>
    <w:insideV w:val="single" w:sz="${size}" w:color="${color}"/>
  </w:tblBorders>`;
}

function fiscalYearReportCellXml(contentXml, options = {}) {
  const {
    width = null,
    fill = null,
    vertical = 'center',
    borders = null,
    margins = fiscalYearReportCellMarginsXml(),
  } = options;
  return `<w:tc>
    <w:tcPr>
      ${width ? `<w:tcW w:w="${Math.round(width)}" w:type="dxa"/>` : ''}
      ${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}
      <w:vAlign w:val="${vertical}"/>
      ${margins}
      ${borders || ''}
    </w:tcPr>
    ${contentXml || fiscalYearReportParagraphXml('', { after: 0 })}
  </w:tc>`;
}

function fiscalYearReportTextCellXml(text, options = {}) {
  const {
    width,
    fill,
    align = 'left',
    bold = false,
    color = FISCAL_YEAR_DOCX.text,
    size = 16,
    after = 0,
    italic = false,
  } = options;
  return fiscalYearReportCellXml(
    fiscalYearReportParagraphXml(text, { align, bold, color, size, after, italic, line: 210 }),
    { width, fill },
  );
}

function fiscalYearReportRowXml(cellsXml, options = {}) {
  const { cantSplit = true, height = null } = options;
  return `<w:tr>
    <w:trPr>${cantSplit ? '<w:cantSplit/>' : ''}${height ? `<w:trHeight w:val="${height}" w:hRule="atLeast"/>` : ''}</w:trPr>
    ${cellsXml}
  </w:tr>`;
}

function fiscalYearReportTableXml(tableData, options = {}) {
  const columnCount = tableData.columnCount || tableData.rows?.[0]?.cells?.length || 1;
  const width = options.width || FISCAL_YEAR_DOCX.usableWidth;
  const fractions = (tableData.columnFractions?.length === columnCount ? tableData.columnFractions : null)
    || Array.from({ length: columnCount }, () => 1 / columnCount);
  const widths = fractions.map(fraction => Math.max(300, Math.round(width * fraction)));
  const widthTotal = widths.reduce((sum, value) => sum + value, 0);
  if (widthTotal !== width) widths[widths.length - 1] += width - widthTotal;

  const fontSize = options.fontSize || (columnCount >= 8 ? 13 : columnCount >= 6 ? 14 : columnCount >= 5 ? 15 : 16);
  const grid = widths.map(columnWidth => `<w:gridCol w:w="${columnWidth}"/>`).join('');
  const rowsXml = (tableData.rows || []).map(row => {
    const fill = row.isHeader ? FISCAL_YEAR_DOCX.blue : (row.isTotal ? FISCAL_YEAR_DOCX.lightBlue : null);
    const color = row.isHeader ? 'FFFFFF' : FISCAL_YEAR_DOCX.text;
    const bold = row.isHeader || row.isTotal || row.isHeadline;
    const cells = Array.from({ length: columnCount }, (_, index) => {
      const cell = row.cells[index] || { text: '', align: index === 0 ? 'left' : 'right' };
      return fiscalYearReportTextCellXml(cell.text, {
        width: widths[index],
        fill,
        align: row.isHeader ? 'center' : cell.align,
        bold,
        color,
        size: row.isHeader ? Math.max(13, fontSize) : fontSize,
      });
    }).join('');
    return fiscalYearReportRowXml(cells, { height: row.isHeader ? 300 : 260 });
  }).join('');

  return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="${width}" w:type="dxa"/>
      <w:tblLayout w:type="fixed"/>
      <w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar>
      ${fiscalYearReportTableBordersXml()}
    </w:tblPr>
    <w:tblGrid>${grid}</w:tblGrid>
    ${rowsXml}
  </w:tbl>`;
}

function fiscalYearReportOuterCardXml(card, options = {}) {
  const compact = Boolean(options.compact);
  const innerWidth = FISCAL_YEAR_DOCX.usableWidth - 220;
  const body = [];
  if (card.eyebrow) body.push(fiscalYearReportParagraphXml(card.eyebrow.toUpperCase(), {
    bold: true, color: FISCAL_YEAR_DOCX.accentBlue, size: 12, after: 20, keepNext: true,
  }));
  body.push(fiscalYearReportParagraphXml(card.title, {
    bold: true, color: FISCAL_YEAR_DOCX.text, size: compact ? 19 : 20, after: 20, keepNext: true,
  }));
  if (card.subtitle) body.push(fiscalYearReportParagraphXml(card.subtitle, {
    color: FISCAL_YEAR_DOCX.muted, size: compact ? 13 : 14, after: 75,
  }));

  (card.sections || []).forEach((section, index) => {
    if (section.type === 'subheading') {
      body.push(fiscalYearReportParagraphXml(section.text, {
        bold: true, color: FISCAL_YEAR_DOCX.darkBlue, size: 14, before: index ? 65 : 0, after: 35, keepNext: true,
      }));
    } else if (section.type === 'paragraph') {
      body.push(fiscalYearReportParagraphXml(section.text, {
        color: section.footnote ? FISCAL_YEAR_DOCX.muted : FISCAL_YEAR_DOCX.text,
        italic: section.footnote,
        size: section.footnote ? 12 : 13,
        after: 55,
      }));
    } else if (section.type === 'table') {
      body.push(fiscalYearReportTableXml(section, { width: innerWidth }));
      body.push(fiscalYearReportParagraphXml('', { size: 4, after: 40, line: 80 }));
    } else if (section.type === 'notes') {
      const noteRows = section.items.map(item => ({
        cells: [{ text: item.label, align: 'left' }, { text: item.value, align: 'left' }],
      }));
      body.push(fiscalYearReportTableXml({
        columnCount: 2,
        columnFractions: [0.28, 0.72],
        rows: noteRows,
      }, { width: innerWidth, fontSize: 13 }));
      body.push(fiscalYearReportParagraphXml('', { size: 4, after: 25, line: 80 }));
    } else if (section.type === 'gap') {
      const fill = section.positive ? FISCAL_YEAR_DOCX.greenFill : FISCAL_YEAR_DOCX.redFill;
      const color = section.positive ? FISCAL_YEAR_DOCX.greenText : FISCAL_YEAR_DOCX.redText;
      const gapTable = {
        columnCount: 2,
        columnFractions: [0.55, 0.45],
        rows: [{
          isTotal: true,
          cells: [{ text: section.label, align: 'left' }, { text: section.value, align: 'right' }],
        }],
      };
      const gapXml = fiscalYearReportTableXml(gapTable, { width: innerWidth, fontSize: 16 })
        .replace(new RegExp(`w:fill="${FISCAL_YEAR_DOCX.lightBlue}"`, 'g'), `w:fill="${fill}"`)
        .replace(new RegExp(`<w:color w:val="${FISCAL_YEAR_DOCX.text}"/>`, 'g'), `<w:color w:val="${color}"/>`);
      body.push(gapXml);
    }
  });

  const cardBorder = `<w:tcBorders><w:top w:val="single" w:sz="7" w:color="${FISCAL_YEAR_DOCX.border}"/><w:left w:val="single" w:sz="7" w:color="${FISCAL_YEAR_DOCX.border}"/><w:bottom w:val="single" w:sz="7" w:color="${FISCAL_YEAR_DOCX.border}"/><w:right w:val="single" w:sz="7" w:color="${FISCAL_YEAR_DOCX.border}"/></w:tcBorders>`;
  return `<w:tbl>
    <w:tblPr><w:tblW w:w="${FISCAL_YEAR_DOCX.usableWidth}" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr>
    <w:tblGrid><w:gridCol w:w="${FISCAL_YEAR_DOCX.usableWidth}"/></w:tblGrid>
    ${fiscalYearReportRowXml(fiscalYearReportCellXml(body.join(''), {
      width: FISCAL_YEAR_DOCX.usableWidth,
      borders: cardBorder,
      margins: fiscalYearReportCellMarginsXml(95, 110, 95, 110),
      vertical: 'top',
    }))}
  </w:tbl>`;
}

function fiscalYearReportPageBreakXml() {
  // Start the next report page without adding any repeated dashboard/FY header.
  return '<w:p><w:pPr><w:pageBreakBefore/><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>';
}

function fiscalYearReportChartDrawingXml(relationshipId) {
  // Fit the chart comfortably inside an A4 portrait page with 1-inch margins.
  // The chart alone is graphical; all surrounding content is native Word.
  const cx = 3383280; // 3.70 in
  const cy = 2240280; // 2.45 in
  return `<w:p>
    <w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="35"/></w:pPr>
    <w:r><w:drawing>
      <wp:inline distT="0" distB="0" distL="0" distR="0">
        <wp:extent cx="${cx}" cy="${cy}"/>
        <wp:effectExtent l="0" t="0" r="0" b="0"/>
        <wp:docPr id="1" name="Capacity Allocation Donut" descr="Capacity Allocation donut chart"/>
        <wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>
        <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:pic>
            <pic:nvPicPr><pic:cNvPr id="1" name="capacity-allocation.png"/><pic:cNvPicPr/></pic:nvPicPr>
            <pic:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
            <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
          </pic:pic>
        </a:graphicData></a:graphic>
      </wp:inline>
    </w:drawing></w:r>
  </w:p>`;
}

function fiscalYearReportFinancialMetricsXml(metrics) {
  const values = [...metrics];
  while (values.length < 4) values.push({ value: '—', label: '' });
  const cellWidth = Math.round((FISCAL_YEAR_DOCX.usableWidth - 220) / 2);
  const cell = metric => fiscalYearReportCellXml(
    fiscalYearReportParagraphXml(metric.value, {
      bold: true, size: 22, color: FISCAL_YEAR_DOCX.darkBlue, align: 'center', after: 18,
    }) + fiscalYearReportParagraphXml(metric.label, {
      size: 11, color: FISCAL_YEAR_DOCX.muted, align: 'center', after: 0,
    }),
    { width: cellWidth, fill: FISCAL_YEAR_DOCX.lighterBlue, margins: fiscalYearReportCellMarginsXml(90, 70, 90, 70) },
  );
  return `<w:tbl>
    <w:tblPr><w:tblW w:w="${cellWidth * 2}" w:type="dxa"/><w:tblLayout w:type="fixed"/>${fiscalYearReportTableBordersXml()}</w:tblPr>
    <w:tblGrid><w:gridCol w:w="${cellWidth}"/><w:gridCol w:w="${cellWidth}"/></w:tblGrid>
    ${fiscalYearReportRowXml(cell(values[0]) + cell(values[1]), { height: 720 })}
    ${fiscalYearReportRowXml(cell(values[2]) + cell(values[3]), { height: 720 })}
  </w:tbl>`;
}

function fiscalYearReportLegendXml(legend, width) {
  const swatchWidth = 300;
  const valueWidth = 1050;
  const labelWidth = Math.max(900, width - swatchWidth - valueWidth);
  const rows = legend.map(item => {
    const swatch = fiscalYearReportCellXml(fiscalYearReportParagraphXml(' ', { after: 0, size: 7 }), {
      width: swatchWidth,
      fill: item.color,
      margins: fiscalYearReportCellMarginsXml(45, 55, 45, 55),
    });
    const label = fiscalYearReportTextCellXml(item.label, { width: labelWidth, size: 13, align: 'left' });
    const value = fiscalYearReportTextCellXml(item.value, { width: valueWidth, size: 13, bold: true, align: 'right' });
    return fiscalYearReportRowXml(swatch + label + value, { height: 250 });
  }).join('');
  return `<w:tbl>
    <w:tblPr><w:tblW w:w="${width}" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr>
    <w:tblGrid><w:gridCol w:w="${swatchWidth}"/><w:gridCol w:w="${labelWidth}"/><w:gridCol w:w="${valueWidth}"/></w:tblGrid>
    ${rows}
  </w:tbl>`;
}

function fiscalYearReportCapacityCardXml(capacity, hasChartImage) {
  const innerWidth = FISCAL_YEAR_DOCX.usableWidth - 220;
  const chartCellWidth = 5650;
  const legendCellWidth = innerWidth - chartCellWidth;
  const body = [];
  if (capacity.eyebrow) body.push(fiscalYearReportParagraphXml(capacity.eyebrow.toUpperCase(), {
    bold: true, color: FISCAL_YEAR_DOCX.accentBlue, size: 12, after: 20, keepNext: true,
  }));
  body.push(fiscalYearReportParagraphXml(capacity.title, {
    bold: true, size: 21, color: FISCAL_YEAR_DOCX.text, after: 20, keepNext: true,
  }));
  if (capacity.subtitle) body.push(fiscalYearReportParagraphXml(capacity.subtitle, {
    size: 13, color: FISCAL_YEAR_DOCX.muted, after: 70,
  }));
  body.push(fiscalYearReportFinancialMetricsXml(capacity.metrics));
  body.push(fiscalYearReportParagraphXml('', { size: 4, after: 70, line: 80 }));

  const chartContent = hasChartImage
    ? `${fiscalYearReportChartDrawingXml('rIdCapacityChart')}${capacity.chartCaption ? fiscalYearReportParagraphXml(capacity.chartCaption, { italic: true, size: 11, color: FISCAL_YEAR_DOCX.muted, align: 'center', after: 0 }) : ''}`
    : fiscalYearReportParagraphXml('Capacity Allocation chart unavailable.', { size: 14, color: FISCAL_YEAR_DOCX.muted, align: 'center' });
  const legendContent = fiscalYearReportLegendXml(capacity.legend, legendCellWidth - 80);
  body.push(`<w:tbl>
    <w:tblPr><w:tblW w:w="${innerWidth}" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr>
    <w:tblGrid><w:gridCol w:w="${chartCellWidth}"/><w:gridCol w:w="${legendCellWidth}"/></w:tblGrid>
    ${fiscalYearReportRowXml(
      fiscalYearReportCellXml(chartContent, { width: chartCellWidth, margins: fiscalYearReportCellMarginsXml(20, 60, 20, 20), vertical: 'center' })
      + fiscalYearReportCellXml(legendContent, { width: legendCellWidth, margins: fiscalYearReportCellMarginsXml(20, 20, 20, 60), vertical: 'center' }),
    )}
  </w:tbl>`);

  const border = `<w:tcBorders><w:top w:val="single" w:sz="7" w:color="${FISCAL_YEAR_DOCX.border}"/><w:left w:val="single" w:sz="7" w:color="${FISCAL_YEAR_DOCX.border}"/><w:bottom w:val="single" w:sz="7" w:color="${FISCAL_YEAR_DOCX.border}"/><w:right w:val="single" w:sz="7" w:color="${FISCAL_YEAR_DOCX.border}"/></w:tcBorders>`;
  return `<w:tbl>
    <w:tblPr><w:tblW w:w="${FISCAL_YEAR_DOCX.usableWidth}" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr>
    <w:tblGrid><w:gridCol w:w="${FISCAL_YEAR_DOCX.usableWidth}"/></w:tblGrid>
    ${fiscalYearReportRowXml(fiscalYearReportCellXml(body.join(''), {
      width: FISCAL_YEAR_DOCX.usableWidth,
      borders: border,
      margins: fiscalYearReportCellMarginsXml(100, 110, 100, 110),
      vertical: 'top',
    }))}
  </w:tbl>`;
}

function fiscalYearReportCardSpacerXml() {
  return fiscalYearReportParagraphXml('', { size: 4, after: 95, line: 80 });
}

function createFiscalYearReportDocumentXml(reportData, hasChartImage) {
  const page1 = `${fiscalYearReportCapacityCardXml(reportData.capacity, hasChartImage)}`;
  const page2 = `${fiscalYearReportPageBreakXml()}
    ${fiscalYearReportOuterCardXml(reportData.executive)}
    ${fiscalYearReportCardSpacerXml()}
    ${fiscalYearReportOuterCardXml(reportData.available)}`;
  const page3 = `${fiscalYearReportPageBreakXml()}
    ${fiscalYearReportOuterCardXml(reportData.maximumRevenue, { compact: true })}
    ${fiscalYearReportCardSpacerXml()}
    ${fiscalYearReportOuterCardXml(reportData.revenueTargets, { compact: true })}`;
  const page4 = `${fiscalYearReportPageBreakXml()}
    ${fiscalYearReportOuterCardXml(reportData.capacityValue, { compact: true })}
    ${fiscalYearReportCardSpacerXml()}
    ${fiscalYearReportOuterCardXml(reportData.pipelineTarget, { compact: true })}`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document
  xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
  xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
  xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
  mc:Ignorable="w14 wp14">
  <w:body>
    ${page1}
    ${page2}
    ${page3}
    ${page4}
    <w:sectPr>
      <w:footerReference w:type="default" r:id="rIdFooter"/>
      <w:pgSz w:w="${FISCAL_YEAR_DOCX.pageWidth}" w:h="${FISCAL_YEAR_DOCX.pageHeight}"/>
      <w:pgMar w:top="${FISCAL_YEAR_DOCX.marginTop}" w:right="${FISCAL_YEAR_DOCX.marginRight}" w:bottom="${FISCAL_YEAR_DOCX.marginBottom}" w:left="${FISCAL_YEAR_DOCX.marginLeft}" w:header="720" w:footer="720" w:gutter="0"/>
      <w:cols w:space="720"/>
      <w:docGrid w:linePitch="240"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function createFiscalYearReportFooterXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr><w:jc w:val="right"/><w:spacing w:before="0" w:after="0"/></w:pPr>
    ${fiscalYearReportRunXml('Page ', { size: 11, color: FISCAL_YEAR_DOCX.muted })}
    <w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:color w:val="${FISCAL_YEAR_DOCX.muted}"/><w:sz w:val="11"/><w:szCs w:val="11"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r>
    <w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>
    <w:r><w:fldChar w:fldCharType="end"/></w:r>
    ${fiscalYearReportRunXml(' of ', { size: 11, color: FISCAL_YEAR_DOCX.muted })}
    <w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:color w:val="${FISCAL_YEAR_DOCX.muted}"/><w:sz w:val="11"/><w:szCs w:val="11"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r>
    <w:r><w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r>
    <w:r><w:fldChar w:fldCharType="end"/></w:r>
  </w:p>
</w:ftr>`;
}

function createFiscalYearReportStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="${FISCAL_YEAR_DOCX.text}"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
</w:styles>`;
}

async function buildFiscalYearReportDocx(reportData) {
  if (typeof JSZip !== 'function') {
    throw new Error('DOCX packager is unavailable. Refresh the page and try again.');
  }

  const chartDataUrl = reportData.capacity.chartImage;
  const hasChartImage = Boolean(chartDataUrl?.startsWith('data:image/'));
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${hasChartImage ? '<Default Extension="png" ContentType="image/png"/>' : ''}
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`);

  zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);

  const now = new Date().toISOString();
  zip.folder('docProps').file('core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${fiscalYearReportXmlEscape(`Workforce Allocation Fiscal Year Report - ${reportData.fiscalYearLabel}`)}</dc:title>
  <dc:creator>Workforce Allocation Dashboard</dc:creator>
  <cp:lastModifiedBy>Workforce Allocation Dashboard</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`);
  zip.folder('docProps').file('app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Workforce Allocation Dashboard</Application>
  <Pages>4</Pages>
</Properties>`);

  const word = zip.folder('word');
  word.file('document.xml', createFiscalYearReportDocumentXml(reportData, hasChartImage));
  word.file('styles.xml', createFiscalYearReportStylesXml());
  word.file('footer1.xml', createFiscalYearReportFooterXml());
  word.folder('_rels').file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
  ${hasChartImage ? '<Relationship Id="rIdCapacityChart" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/capacity-allocation.png"/>' : ''}
</Relationships>`);

  if (hasChartImage) {
    const base64 = String(chartDataUrl).split(',')[1] || '';
    word.folder('media').file('capacity-allocation.png', base64, { base64: true });
  }

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
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
