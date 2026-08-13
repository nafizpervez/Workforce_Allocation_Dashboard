function buildWorkTypePivot(rows, rowField) {
  const rowOrder = [], table = {}, totals = {};
  for (const r of rows) {
    const rowLabel = rowField === 'month' ? r.month : r.worker;
    const type = r.workType;
    if (!rowLabel || !type) continue;
    if (!rowOrder.includes(rowLabel)) rowOrder.push(rowLabel);
    table[rowLabel] ||= {};
    table[rowLabel][type] = (table[rowLabel][type] || 0) + r.qty;
    totals[rowLabel] = (totals[rowLabel] || 0) + r.qty;
  }
  if (rowField === 'month') rowOrder.sort((a, b) => monthSortKey(a, rowOrder.indexOf(a)) - monthSortKey(b, rowOrder.indexOf(b)));
  else rowOrder.sort((a, b) => a.localeCompare(b));

  const typeOrder = orderedPresentWorkTypes(rows);
  return { rowOrder, typeOrder, table, totals };
}
const stackedPercentLabelPlugin = { id: 'stackedPercentLabel', afterDatasetsDraw(chart) {
  const { ctx } = chart;
  chart.data.datasets.forEach((ds, datasetIndex) => {
    const meta = chart.getDatasetMeta(datasetIndex);
    meta.data.forEach((bar, index) => {
      const val = Number(ds.data[index]) || 0;
      if (val < 3) return;
      const props = bar.getProps(['x', 'y', 'base'], true);
      ctx.save(); ctx.fillStyle = val >= 15 ? '#111827' : '#374151'; ctx.font = 'bold 10px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`${val.toFixed(val >= 10 ? 0 : 1)}%`, props.x, (props.y + props.base) / 2); ctx.restore();
    });
  });
}};
function buildStackedPercentDatasets(pivot, mode = 'team') {
  const isIndividual = mode === 'individual';

  return pivot.typeOrder.map(type => {
    const color = workTypeColor(type);

    return {
      label: type,
      workType: type,
      timesheetColor: color,
      backgroundColor: color,
      hoverBackgroundColor: color,
      borderColor: color,
      borderWidth: 0,
      borderRadius: 0,
      borderSkipped: false,
      barPercentage: 0.55,
      categoryPercentage: 0.72,
      maxBarThickness: 72,
      data: pivot.rowOrder.map(rowLabel => {
        const total = pivot.totals[rowLabel] || 0;
        const val = pivot.table[rowLabel]?.[type] || 0;
        return total ? +((val / total) * 100).toFixed(2) : 0;
      }),
      hoursData: pivot.rowOrder.map(rowLabel => +(pivot.table[rowLabel]?.[type] || 0).toFixed(2)),
    };
  });
}
function setTimesheetEmptyState(kind, hasData) {
  const empty = document.getElementById(`${kind}SummaryEmpty`); const wrap = document.getElementById(`${kind}SummaryChartWrap`);
  if (empty) empty.classList.toggle('hidden', hasData); if (wrap) wrap.classList.toggle('hidden', !hasData);
}

function getTimesheetTableTooltip(chart) {
  const tooltipId = `timesheet-table-tooltip-${chart.canvas.id}`;
  let element = document.getElementById(tooltipId);

  if (!element) {
    element = document.createElement('div');
    element.id = tooltipId;
    element.className = 'timesheet-table-tooltip';
    element.setAttribute('role', 'tooltip');
    document.body.appendChild(element);
  }

  return element;
}

function formatTimesheetTooltipPercentage(value) {
  const number = Number(value) || 0;
  return `${number.toFixed(1)}%`;
}

function renderTimesheetTableTooltip(context) {
  const { chart, tooltip } = context;
  const element = getTimesheetTableTooltip(chart);

  if (!tooltip || tooltip.opacity === 0 || !tooltip.dataPoints?.length) {
    element.classList.remove('is-visible');
    element.setAttribute('aria-hidden', 'true');
    return;
  }

  const dataIndex = tooltip.dataPoints[0].dataIndex;
  const label = String(tooltip.dataPoints[0].label || '');
  const rows = tooltip.dataPoints.map(point => {
    const dataset = point.dataset || {};
    const allocation = Number(point.parsed?.y) || 0;
    const hours = Number(dataset.hoursData?.[dataIndex]) || 0;
    const color = dataset.timesheetColor || dataset.backgroundColor || '#94A3B8';

    return {
      workType: String(dataset.label || ''),
      allocation,
      hours,
      color: String(color),
    };
  });
  const totalHours = rows.reduce((sum, row) => sum + row.hours, 0);
  const totalAllocation = rows.reduce((sum, row) => sum + row.allocation, 0);

  element.innerHTML = `
    <div class="timesheet-table-tooltip__title">
      <span>${esc(label)}</span>
      <strong>${totalHours.toLocaleString('en-US', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })} hrs</strong>
    </div>
    <table class="timesheet-table-tooltip__table">
      <thead>
        <tr>
          <th scope="col">Work type</th>
          <th scope="col">Allocation</th>
          <th scope="col">Hours</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr>
            <th scope="row">
              <span class="timesheet-table-tooltip__label">
                <span class="timesheet-table-tooltip__swatch" style="background:${esc(row.color)}"></span>
                <span>${esc(row.workType)}</span>
              </span>
            </th>
            <td>${formatTimesheetTooltipPercentage(row.allocation)}</td>
            <td>${row.hours.toLocaleString('en-US', {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            })}</td>
          </tr>
        `).join('')}
        <tr class="timesheet-table-tooltip__total">
          <th scope="row">Total</th>
          <td>${formatTimesheetTooltipPercentage(totalAllocation)}</td>
          <td>${totalHours.toLocaleString('en-US', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })}</td>
        </tr>
      </tbody>
    </table>
  `;

  element.style.left = '0px';
  element.style.top = '0px';
  element.classList.add('is-visible');
  element.setAttribute('aria-hidden', 'false');

  const canvasRect = chart.canvas.getBoundingClientRect();
  const tooltipRect = element.getBoundingClientRect();
  const gap = 14;
  let left = canvasRect.left + tooltip.caretX + gap;
  let top = canvasRect.top + tooltip.caretY + gap;

  if (left + tooltipRect.width > window.innerWidth - 8) {
    left = canvasRect.left + tooltip.caretX - tooltipRect.width - gap;
  }
  if (top + tooltipRect.height > window.innerHeight - 8) {
    top = canvasRect.top + tooltip.caretY - tooltipRect.height - gap;
  }

  element.style.left = `${Math.max(8, Math.min(left, window.innerWidth - tooltipRect.width - 8))}px`;
  element.style.top = `${Math.max(8, Math.min(top, window.innerHeight - tooltipRect.height - 8))}px`;
}

function renderTeamSummaryChart() {
  const canvas = document.getElementById('teamSummaryChart');
  if (!canvas) return;

  if (S.charts.teamSummary) {
    S.charts.teamSummary.destroy();
  }

  const allRows = S.timesheetRows || [];
  const rows = getWorkSummaryTimesheetRows();
  const info = document.getElementById('teamSummaryInfo');
  const fiscalYearLabel = fiscalYearDisplayLabel(S.matrixFiscalYear);

  if (!allRows.length) {
    setTimesheetEmptyState('team', false);
    if (info) info.textContent = '';
    return;
  }

  if (!rows.length) {
    setTimesheetEmptyState('team', false);
    if (info) info.textContent = `No Time Sheet rows found for ${fiscalYearLabel}. Inactive employees/managers are excluded.`;
    return;
  }

  setTimesheetEmptyState('team', true);

  const pivot = buildWorkTypePivot(rows, 'month');
  const datasets = buildStackedPercentDatasets(pivot, 'team');
  const totalHours = rows.reduce((s, r) => s + r.qty, 0);

  if (info) {
    info.textContent = `${fiscalYearLabel} · ${pivot.rowOrder.length} month${pivot.rowOrder.length === 1 ? '' : 's'} · ${pivot.typeOrder.length} work type${pivot.typeOrder.length === 1 ? '' : 's'} · ${totalHours.toFixed(1)} hrs · inactive employees/managers excluded`;
  }

  S.charts.teamSummary = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    plugins: [stackedPercentLabelPlugin],
    data: {
      labels: pivot.rowOrder,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      onClick: (event, elements) => {
        if (elements.length) {
          openTimesheetSummaryModal('team', pivot.rowOrder[elements[0].index]);
        }
      },
      onHover: (event, elements) => {
        const target = event.native?.target;
        if (target) target.style.cursor = elements.length ? 'pointer' : 'default';
      },
      plugins: {
        legend: {
          display: true,
          position: 'right',
          labels: timesheetLegendLabels(),
        },
        tooltip: {
          enabled: false,
          external: renderTimesheetTableTooltip,
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: {
            display: false,
          },
          ticks: {
            font: {
              size: 11,
            },
            color: '#374151',
          },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          max: 100,
          ticks: {
            callback: v => `${v}%`,
            font: {
              size: 11,
            },
            color: '#6B7280',
          },
          grid: {
            color: '#F3F4F6',
          },
        },
      },
    },
  });
}

function renderIndividualSummaryChart() {
  const canvas = document.getElementById('individualSummaryChart');
  if (!canvas) return;

  if (S.charts.individualSummary) {
    S.charts.individualSummary.destroy();
  }

  populateIndividualMonthFilter();

  const allRows = S.timesheetRows || [];
  const visibleRows = getWorkSummaryTimesheetRows();
  const rows = getIndividualSummaryRows();
  const info = document.getElementById('individualSummaryInfo');
  const fiscalYearLabel = fiscalYearDisplayLabel(S.matrixFiscalYear);

  if (!allRows.length) {
    setTimesheetEmptyState('individual', false);
    if (info) info.textContent = '';
    return;
  }

  if (!visibleRows.length) {
    setTimesheetEmptyState('individual', false);
    if (info) info.textContent = `No Time Sheet rows found for ${fiscalYearLabel}. Inactive employees/managers are excluded.`;
    return;
  }

  if (!rows.length) {
    setTimesheetEmptyState('individual', false);
    if (info) info.textContent = 'No active employee rows found for selected month.';
    return;
  }

  setTimesheetEmptyState('individual', true);

  const pivot = buildWorkTypePivot(rows, 'worker');
  const datasets = buildStackedPercentDatasets(pivot, 'individual');
  const totalHours = rows.reduce((s, r) => s + r.qty, 0);
  const monthText = S.individualSummaryMonthFilter ? ` · Month: ${S.individualSummaryMonthFilter}` : ' · All months';

  if (info) {
    info.textContent = `${fiscalYearLabel} · ${pivot.rowOrder.length} employee${pivot.rowOrder.length === 1 ? '' : 's'} · ${pivot.typeOrder.length} work type${pivot.typeOrder.length === 1 ? '' : 's'} · ${totalHours.toFixed(1)} hrs${monthText} · inactive employees/managers excluded`;
  }

  S.charts.individualSummary = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    plugins: [stackedPercentLabelPlugin],
    data: {
      labels: pivot.rowOrder,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      onClick: (event, elements) => {
        if (elements.length) {
          openTimesheetSummaryModal('individual', pivot.rowOrder[elements[0].index]);
        }
      },
      onHover: (event, elements) => {
        const target = event.native?.target;
        if (target) target.style.cursor = elements.length ? 'pointer' : 'default';
      },
      plugins: {
        legend: {
          display: true,
          position: 'right',
          labels: timesheetLegendLabels(),
        },
        tooltip: {
          enabled: false,
          external: renderTimesheetTableTooltip,
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: {
            display: false,
          },
          ticks: {
            font: {
              size: 10,
            },
            color: '#374151',
            maxRotation: 45,
            minRotation: 35,
          },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          max: 100,
          ticks: {
            callback: v => `${v}%`,
            font: {
              size: 11,
            },
            color: '#6B7280',
          },
          grid: {
            color: '#F3F4F6',
          },
        },
      },
    },
  });
}

