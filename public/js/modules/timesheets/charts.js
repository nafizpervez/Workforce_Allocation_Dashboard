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
function renderTeamSummaryChart() {
  const canvas = document.getElementById('teamSummaryChart');
  if (!canvas) return;

  if (S.charts.teamSummary) {
    S.charts.teamSummary.destroy();
  }

  const allRows = S.timesheetRows || [];
  const rows = getVisibleTimesheetRows();
  const info = document.getElementById('teamSummaryInfo');

  if (!allRows.length) {
    setTimesheetEmptyState('team', false);
    if (info) info.textContent = '';
    return;
  }

  if (!rows.length) {
    setTimesheetEmptyState('team', false);
    if (info) info.textContent = 'No active Time Sheet rows found. Inactive employees are excluded.';
    return;
  }

  setTimesheetEmptyState('team', true);

  const pivot = buildWorkTypePivot(rows, 'month');
  const datasets = buildStackedPercentDatasets(pivot, 'team');
  const totalHours = rows.reduce((s, r) => s + r.qty, 0);

  if (info) {
    info.textContent = `${pivot.rowOrder.length} month${pivot.rowOrder.length === 1 ? '' : 's'} · ${pivot.typeOrder.length} work type${pivot.typeOrder.length === 1 ? '' : 's'} · ${totalHours.toFixed(1)} hrs · inactive employees/managers excluded`;
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
          callbacks: {
            title: items => `${items[0].label} · ${pivot.totals[items[0].label].toFixed(1)} hrs`,
            label: ctx => ` ${ctx.dataset.label}: ${(ctx.parsed.y || 0).toFixed(1)}% (${(ctx.dataset.hoursData[ctx.dataIndex] || 0).toFixed(1)} hrs)`,
          },
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
  const visibleRows = getVisibleTimesheetRows();
  const rows = getIndividualSummaryRows();
  const info = document.getElementById('individualSummaryInfo');

  if (!allRows.length) {
    setTimesheetEmptyState('individual', false);
    if (info) info.textContent = '';
    return;
  }

  if (!visibleRows.length) {
    setTimesheetEmptyState('individual', false);
    if (info) info.textContent = 'No active Time Sheet rows found. Inactive employees are excluded.';
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
    info.textContent = `${pivot.rowOrder.length} employee${pivot.rowOrder.length === 1 ? '' : 's'} · ${pivot.typeOrder.length} work type${pivot.typeOrder.length === 1 ? '' : 's'} · ${totalHours.toFixed(1)} hrs${monthText} · inactive employees/managers excluded`;
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
          callbacks: {
            title: items => `${items[0].label} · ${pivot.totals[items[0].label].toFixed(1)} hrs`,
            label: ctx => ` ${ctx.dataset.label}: ${(ctx.parsed.y || 0).toFixed(1)}% (${(ctx.dataset.hoursData[ctx.dataIndex] || 0).toFixed(1)} hrs)`,
          },
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

