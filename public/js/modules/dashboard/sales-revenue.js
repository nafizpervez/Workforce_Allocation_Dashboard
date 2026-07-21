/* ================================================================ PS REVENUE CHART */
function renderPsRevenueChart(data, prodFilter) {
  if (data) S.psRevenueData = data;
  if (prodFilter !== undefined) S.nlProductFilter = prodFilter instanceof Set ? prodFilter : new Set([prodFilter]);
  const pf = S.nlProductFilter;

  // Merge multi-category revenue data
  const allCats = [...pf];
  const isAllMode = allCats.includes('ALL');
  const cats = isAllMode ? ['ALL'] : allCats;

  const fyMap = {};
  for (const cat of cats) {
    const catData = S.psRevenueData[cat] || [];
    for (const fy of catData) {
      if (!fyMap[fy.fy]) fyMap[fy.fy] = { ...fy, total_amount: 0, ps_amount: 0, all_projects: [], ps_projects: [] };
      const entry = fyMap[fy.fy];
      if (isAllMode || cats.length === 1) {
        entry.total_amount = fy.total_amount;
        entry.ps_amount = fy.ps_amount;
        entry.pct = fy.pct;
        entry.all_projects = fy.all_projects;
        entry.ps_projects = fy.ps_projects;
      } else {
        // Multi-category: sum amounts, dedup projects by code
        const seenAll = new Set(entry.all_projects.map(p => p.code));
        const seenPS = new Set(entry.ps_projects.map(p => p.code));
        for (const p of (fy.all_projects || [])) { if (!seenAll.has(p.code)) { seenAll.add(p.code); entry.all_projects.push(p); entry.total_amount += p.amount || 0; } }
        for (const p of (fy.ps_projects || [])) { if (!seenPS.has(p.code)) { seenPS.add(p.code); entry.ps_projects.push(p); entry.ps_amount += p.amount || 0; } }
        entry.pct = entry.total_amount > 0 ? +((entry.ps_amount / entry.total_amount) * 100).toFixed(1) : 0;
      }
    }
  }
  const data2 = Object.values(fyMap).sort((a, b) => a.fy - b.fy);

  // Sync category buttons
  document.querySelectorAll('.nl-prod-btn').forEach(b => {
    const isActive = pf.has(b.dataset.prod);
    b.style.background = isActive ? '#1e40af' : 'white';
    b.style.color = isActive ? 'white' : '#374151';
    b.style.borderColor = isActive ? '#1e40af' : '#e5e7eb';
  });

  if (S.charts.psRevenue) S.charts.psRevenue.destroy();
  if (S.charts.psRevenue) S.charts.psRevenue.destroy();
  const canvas = document.getElementById('psRevenueChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const fmtUsdK = v => v >= 1_000_000 ? '$' + (v / 1_000_000).toFixed(2) + 'M' : v >= 1_000 ? '$' + (v / 1_000).toFixed(1) + 'K' : '$' + Number(v).toFixed(0);

  const gradTotal = ctx.createLinearGradient(0, 0, 0, 300);
  gradTotal.addColorStop(0, 'rgba(14,165,233,0.88)'); gradTotal.addColorStop(1, 'rgba(56,189,248,0.55)');
  const gradPS = ctx.createLinearGradient(0, 0, 0, 300);
  gradPS.addColorStop(0, 'rgba(139,92,246,0.88)'); gradPS.addColorStop(1, 'rgba(99,102,241,0.55)');
  const gradPct = ctx.createLinearGradient(0, 0, 0, 300);
  gradPct.addColorStop(0, 'rgba(16,185,129,0.88)'); gradPct.addColorStop(1, 'rgba(52,211,153,0.55)');

  const labelPlugin = {
    id: 'barTopLabel',
    afterDatasetsDraw(chart) {
      const { ctx: c } = chart;
      chart.data.datasets.forEach((ds, dsIdx) => {
        chart.getDatasetMeta(dsIdx).data.forEach((bar, i) => {
          const val = ds.data[i];
          if (!val && val !== 0) return;
          const { x, y } = bar.getProps(['x', 'y'], true);
          c.save(); c.fillStyle = '#1f2937'; c.font = 'bold 11px Inter,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'bottom';
          c.fillText(dsIdx === 0 ? fmtUsdK(val) : dsIdx === 1 ? fmtUsdK(val) : val.toFixed(1) + '%', x, y - 3);
          c.restore();
        });
      });
    }
  };

  S.charts.psRevenue = new Chart(ctx, {
    type: 'bar',
    plugins: [labelPlugin],
    data: {
      labels: data2.map(d => d.label),
      datasets: [
        { label: 'Total Amount', data: data2.map(d => d.total_amount), backgroundColor: gradTotal, hoverBackgroundColor: '#0ea5e9', borderRadius: 5, borderSkipped: false, yAxisID: 'yAmt', barPercentage: 0.85, categoryPercentage: 0.75 },
        { label: 'PS Amount', data: data2.map(d => d.ps_amount), backgroundColor: gradPS, hoverBackgroundColor: '#7c3aed', borderRadius: 5, borderSkipped: false, yAxisID: 'yAmt', barPercentage: 0.85, categoryPercentage: 0.75 },
        { label: 'PS Share %', data: data2.map(d => d.pct), backgroundColor: gradPct, hoverBackgroundColor: '#059669', borderRadius: 5, borderSkipped: false, yAxisID: 'yPct', barPercentage: 0.85, categoryPercentage: 0.75 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      onClick: (event, elements) => {
        if (!elements.length) return;
        const idx = elements[0].index;
        if (data2[idx]) openRevenueModal(data2[idx]);
      },
      onHover: (event, elements) => {
        const target = event.native?.target;
        if (target) target.style.cursor = elements.length ? 'pointer' : 'default';
      },
      layout: { padding: { top: 28, left: 4, right: 4, bottom: 0 } },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true, position: 'bottom',
          labels: {
            boxWidth: 12, boxHeight: 12, padding: 18, font: { size: 12, weight: '600' }, generateLabels: () => [
              { text: 'Total Amount', fillStyle: '#0ea5e9', strokeStyle: 'transparent', index: 0 },
              { text: 'PS Amount', fillStyle: '#8b5cf6', strokeStyle: 'transparent', index: 1 },
              { text: 'PS Share %', fillStyle: '#10b981', strokeStyle: 'transparent', index: 2 },
            ]
          }
        },
        tooltip: {
          bodyFont: { size: 12 }, titleFont: { size: 12, weight: '600' }, padding: 12,
          callbacks: {
            title: items => items[0].label,
            label: c => c.datasetIndex === 0 ? `  Total Amount: ${fmtUsdK(c.parsed.y)}` : c.datasetIndex === 1 ? `  PS Amount:    ${fmtUsdK(c.parsed.y)}` : `  PS Share:     ${c.parsed.y.toFixed(1)}%`
          }
        },
      },
      scales: {
        x: { ticks: { font: { size: 13, weight: '600' }, color: '#374151' }, grid: { display: false }, border: { display: false } },
        yAmt: { type: 'linear', position: 'left', beginAtZero: true, ticks: { font: { size: 11 }, color: '#6B7280', callback: v => fmtUsdK(v) }, grid: { color: '#F3F4F6' }, border: { display: false }, title: { display: true, text: 'Amount (USD)', font: { size: 11 }, color: '#9CA3AF' } },
        yPct: { type: 'linear', position: 'right', beginAtZero: true, max: 100, ticks: { font: { size: 11 }, color: '#6B7280', callback: v => v + '%' }, grid: { display: false }, border: { display: false }, title: { display: true, text: 'PS Share %', font: { size: 11 }, color: '#9CA3AF' } }
      }
    }
  });
}

/* ── PS Type chart drill-down modal ──────────────────────────── */
function openPsTypeModal(d) {
  const section = (title, count, color, projects) => {
    const empty = '<p class="text-xs text-gray-400 px-3 py-2">No projects this FY</p>';
    return `<div>
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-sm inline-block flex-shrink-0" style="background:${color}"></span>
          <span class="text-sm font-semibold text-gray-800">${esc(title)}</span>
          <span class="text-xs text-gray-400">${count} project${count === 1 ? '' : 's'}</span>
        </div>
      </div>
      <div class="space-y-1 max-h-60 overflow-y-auto nice-scroll pr-1">
        ${projects.length
        ? projects.map((name, i) => `
            <div class="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-gray-50 border border-gray-100 hover:bg-gray-100 transition-colors">
              <span class="text-xs font-medium text-gray-400 w-5 flex-shrink-0">${i + 1}.</span>
              <span class="text-sm text-gray-800">${esc(name)}</span>
            </div>`).join('')
        : empty}
      </div>
    </div>`;
  };

  openModal(`${mHdr(d.label + ' — PS Service Mix', 'Closed Won projects by engagement type')}
    <div class="p-6 overflow-y-auto nice-scroll space-y-6" style="max-height:65vh">
      ${section('PS System Support', d.support, '#3b82f6', d.supportProjects || [])}
      <div class="border-t border-gray-100"></div>
      ${section('PS Project Implementation', d.impl, '#10b981', d.implProjects || [])}
    </div>
    <div class="px-6 py-4 border-t border-gray-100 flex justify-end bg-gray-50 rounded-b-2xl">
      <button onclick="closeModal()" class="btn-gray">Close</button>
    </div>`, 'max-w-lg');
}

