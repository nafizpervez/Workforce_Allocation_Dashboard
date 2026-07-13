/* ================================================================ PS TYPE CHART (Chart 3) */
function renderPsTypeChart(data) {
  if (S.charts.psType) S.charts.psType.destroy();
  const canvas = document.getElementById('psTypeChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const gradSupport = ctx.createLinearGradient(0, 0, 0, 300);
  gradSupport.addColorStop(0, 'rgba(59,130,246,0.90)'); gradSupport.addColorStop(1, 'rgba(99,102,241,0.60)');
  const gradImpl = ctx.createLinearGradient(0, 0, 0, 300);
  gradImpl.addColorStop(0, 'rgba(16,185,129,0.90)'); gradImpl.addColorStop(1, 'rgba(52,211,153,0.60)');

  const labelPlugin = {
    id: 'psTypeLabel',
    afterDatasetsDraw(chart) {
      const { ctx: c } = chart;
      chart.data.datasets.forEach((ds, di) => {
        chart.getDatasetMeta(di).data.forEach((bar, i) => {
          const val = ds.data[i];
          if (!val || val < 1) return;
          const { x, y } = bar.getProps(['x', 'y'], true);
          c.save(); c.fillStyle = '#1f2937'; c.font = 'bold 12px Inter,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'bottom';
          c.fillText(val, x, y - 3); c.restore();
        });
      });
    }
  };

  S.charts.psType = new Chart(ctx, {
    type: 'bar',
    plugins: [labelPlugin],
    data: {
      labels: data.map(d => d.label),
      datasets: [
        { label: 'PS System Support', data: data.map(d => d.support), backgroundColor: gradSupport, hoverBackgroundColor: '#2563eb', borderRadius: 5, borderSkipped: false, barPercentage: 0.85, categoryPercentage: 0.72 },
        { label: 'PS Project Implementation', data: data.map(d => d.impl), backgroundColor: gradImpl, hoverBackgroundColor: '#059669', borderRadius: 5, borderSkipped: false, barPercentage: 0.85, categoryPercentage: 0.72 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 24, left: 4, right: 4, bottom: 0 } },
      interaction: { mode: 'index', intersect: false },
      onClick: (event, elements) => {
        if (!elements.length) return;
        const idx = elements[0].index;
        if (S.psTypeData[idx]) openPsTypeModal(S.psTypeData[idx]);
      },
      onHover: (event, elements) => {
        const target = event.native?.target;
        if (target) target.style.cursor = elements.length ? 'pointer' : 'default';
      },
      plugins: {
        legend: {
          display: true, position: 'bottom',
          labels: {
            boxWidth: 12, boxHeight: 12, padding: 20, font: { size: 12, weight: '600' }, generateLabels: () => [
              { text: 'PS System Support', fillStyle: '#3b82f6', strokeStyle: 'transparent', index: 0 },
              { text: 'PS Project Implementation', fillStyle: '#10b981', strokeStyle: 'transparent', index: 1 },
            ]
          }
        },
        tooltip: { bodyFont: { size: 12 }, titleFont: { size: 12, weight: '600' }, padding: 10, callbacks: { label: c => `  ${c.dataset.label}: ${c.parsed.y} deal${c.parsed.y === 1 ? '' : 's'}` } },
      },
      scales: {
        x: { ticks: { font: { size: 13, weight: '600' }, color: '#374151' }, grid: { display: false }, border: { display: false } },
        y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 12 }, color: '#6B7280' }, grid: { color: '#F3F4F6' }, border: { display: false } },
      }
    }
  });
}

/* ── Chart tab switching ──────────────────────────────────────── */
function switchChartTab(tab) {
  document.querySelectorAll('.chart-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.chartTab === tab));
  document.querySelectorAll('.chart-tab-content').forEach(c => c.classList.toggle('hidden', !c.id.endsWith('-' + tab)));
  const filters = document.getElementById('dealAcqFilters');
  // Category filter visible on acquisition + revenue; hidden on PS Engagement tab
  if (filters) filters.classList.toggle('hidden', tab === 'tab3');
  // Status filter row (COMBINED / NEW LOGO / REPEAT / REACTIVE) only on acquisition tab
  const statusRow = document.getElementById('dealStatusFilterRow');
  if (statusRow) statusRow.classList.toggle('hidden', tab !== 'acquisition');
  if (tab === 'revenue') renderPsRevenueChart(null, S.nlProductFilter);
  if (tab === 'tab3') renderPsTypeChart(S.psTypeData);
  if (tab === 'acquisition') renderNewLogoChart(null, S.newLogoFilter, S.nlProductFilter);
}

