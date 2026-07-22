/* ================================================================ NEW LOGO CHART */
const centerLabelPlugin = {
  id: 'centerLabel',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    chart.data.datasets.forEach((ds, i) => {
      chart.getDatasetMeta(i).data.forEach((bar, idx) => {
        const val = ds.data[idx];
        if (!val || val < 1) return;
        const { x, y } = bar.getProps(['x', 'y'], true);
        ctx.save();
        ctx.fillStyle = '#1f2937';
        ctx.font = 'bold 13px Inter,sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(val, x, y - 4);
        ctx.restore();
      });
    });
  }
};

function renderNewLogoChart(data, filter, prodFilter) {
  if (data && typeof data === 'object') S.newLogoChartData = data;
  if (!S.newLogoChartData || typeof S.newLogoChartData !== 'object') S.newLogoChartData = { ALL: [] };

  const f = filter !== undefined ? filter : S.newLogoFilter;
  S.newLogoFilter = f;
  if (prodFilter !== undefined) S.nlProductFilter = prodFilter instanceof Set ? prodFilter : new Set([prodFilter]);
  const pf = S.nlProductFilter;

  // Merge multi-category data: sum counts per FY across all selected categories
  const allCats = [...pf];
  const isAllMode = allCats.includes('ALL');
  const cats = isAllMode ? ['ALL'] : allCats;

  // Build merged dataset
  const fyMap = {};
  for (const cat of cats) {
    const catData = S.newLogoChartData[cat] || [];
    for (const fy of catData) {
      if (!fyMap[fy.fy]) fyMap[fy.fy] = { fy: fy.fy, label: fy.label, 'NEW LOGO': 0, 'REPEAT': 0, 'REACTIVE': 0, projects: { 'NEW LOGO': [], 'REPEAT': [], 'REACTIVE': [] } };
      const entry = fyMap[fy.fy];
      const projects = fy?.projects && typeof fy.projects === 'object' ? fy.projects : {};
      for (const st of ['NEW LOGO', 'REPEAT', 'REACTIVE']) {
        if (isAllMode || cats.length === 1) {
          entry[st] = Number(fy?.[st]) || 0;
          entry.projects[st] = Array.isArray(projects[st]) ? projects[st] : [];
        } else {
          // Multi-category: deduplicate accounts across categories
          const existing = new Set(entry.projects[st].map(p => (p.name || '').toLowerCase()));
          for (const proj of (Array.isArray(projects[st]) ? projects[st] : [])) {
            const key = (proj.name || '').toLowerCase();
            if (!existing.has(key)) { existing.add(key); entry.projects[st].push(proj); }
          }
          entry[st] = entry.projects[st].length;
        }
      }
    }
  }
  const d = Object.values(fyMap).sort((a, b) => a.fy - b.fy);

  // Sync deal-status buttons
  document.querySelectorAll('.nl-filter-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.status === f)
  );

  // Sync category buttons
  document.querySelectorAll('.nl-prod-btn').forEach(b => {
    const isActive = pf.has(b.dataset.prod);
    b.style.background = isActive ? '#1e40af' : 'white';
    b.style.color = isActive ? 'white' : '#374151';
    b.style.borderColor = isActive ? '#1e40af' : '#e5e7eb';
  });

  if (S.charts.newLogo) S.charts.newLogo.destroy();
  const canvas = document.getElementById('newLogoChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const mkGrad = (c1, c2) => {
    const g = ctx.createLinearGradient(0, 0, 0, 300);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    return g;
  };
  const COLORS = {
    'NEW LOGO': { bg: mkGrad('rgba(20,184,166,0.92)', 'rgba(14,165,233,0.72)'), hover: '#0d9488' },
    'REPEAT': { bg: mkGrad('rgba(59,130,246,0.92)', 'rgba(99,102,241,0.72)'), hover: '#2563eb' },
    'REACTIVE': { bg: mkGrad('rgba(245,158,11,0.92)', 'rgba(249,115,22,0.72)'), hover: '#d97706' },
  };

  let datasets, plugins, showLegend;
  if (f === 'COMBINED') {
    datasets = ['NEW LOGO', 'REPEAT', 'REACTIVE'].map(st => ({
      label: st,
      data: d.map(x => x[st] || 0),
      backgroundColor: COLORS[st].bg,
      hoverBackgroundColor: COLORS[st].hover,
      borderRadius: 5, borderSkipped: false,
      barPercentage: 0.85, categoryPercentage: 0.82,
    }));
    plugins = [centerLabelPlugin]; showLegend = true;
  } else {
    datasets = [{
      label: f,
      data: d.map(x => x[f] || 0),
      backgroundColor: COLORS[f].bg,
      hoverBackgroundColor: COLORS[f].hover,
      borderRadius: 8, borderSkipped: false,
      barPercentage: 0.85, categoryPercentage: 0.65,
    }];
    plugins = [centerLabelPlugin]; showLegend = false;
  }

  S.charts.newLogo = new Chart(ctx, {
    type: 'bar',
    plugins,
    data: { labels: d.map(x => x.label), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 28, left: 4, right: 4, bottom: 0 } },
      onClick: (event, elements) => {
        if (!elements.length) return;
        const idx2 = elements[0].index;
        if (d[idx2]) openDealModal(d[idx2]);
      },
      onHover: (event, elements) => {
        const target = event.native?.target;
        if (target) target.style.cursor = elements.length ? 'pointer' : 'default';
      },
      plugins: {
        legend: {
          display: showLegend,
          position: 'bottom',
          labels: {
            boxWidth: 12, boxHeight: 12, padding: 20,
            font: { size: 12, weight: '600' },
            generateLabels: chart => chart.data.datasets.map((ds, i) => ({
              text: ds.label,
              fillStyle: ['#14b8a6', '#3b82f6', '#f59e0b'][i],
              strokeStyle: 'transparent',
              index: i,
            }))
          }
        },
        tooltip: {
          bodyFont: { size: 12 }, titleFont: { size: 12, weight: '600' }, padding: 10,
          callbacks: { label: c => `  ${c.dataset.label}: ${c.parsed.y} account${c.parsed.y === 1 ? '' : 's'}` },
        },
      },
      scales: {
        x: { ticks: { font: { size: 13, weight: '600' }, color: '#374151' }, grid: { display: false }, border: { display: false } },
        y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 12 }, color: '#6B7280' }, grid: { color: '#F3F4F6' }, border: { display: false } },
      }
    }
  });
}


/* ── Revenue chart drill-down modal ──────────────────────────── */
function openRevenueModal(d) {
  // Format full number with commas, no K abbreviation
  const fmtFull = v => {
    if (!v && v !== 0) return '$0.00';
    return '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const projRow = (p, showFamily) => `
    <div class="flex items-center justify-between gap-3 py-1.5 px-3 rounded-lg bg-gray-50 border border-gray-100 hover:bg-gray-100 transition-colors">
      <div class="min-w-0">
        <div class="text-xs font-semibold text-gray-800 truncate">${esc(p.name)}</div>
        <div class="text-xs text-gray-400 mono">${esc(p.code)}${showFamily && p.product_family ? ` · ${esc(p.product_family)}` : ''}</div>
      </div>
      <span class="text-xs font-bold text-gray-700 mono flex-shrink-0">${fmtFull(p.amount)}</span>
    </div>`;

  const allProjs = d.all_projects || [];
  const psProjs = d.ps_projects || [];
  const totalAmt = d.total_amount || 0;
  const psAmt = d.ps_amount || 0;
  const pct = totalAmt > 0 ? (psAmt / totalAmt * 100) : 0;

  openModal(`${mHdr(d.label + ' — Revenue Breakdown', 'Closed Won · Fiscal Period grouping · Amount uses Product Amount first, then Amount fallback')}
    <div class="p-6 overflow-y-auto nice-scroll space-y-6" style="max-height:65vh">

      <!-- Total Amount section -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-sm inline-block flex-shrink-0" style="background:#0ea5e9"></span>
            <span class="text-sm font-semibold text-gray-800">Total Amount</span>
            <span class="text-xs text-gray-400">${allProjs.length} project${allProjs.length === 1 ? '' : 's'}</span>
          </div>
          <span class="text-sm font-bold text-sky-600 mono">${fmtFull(totalAmt)}</span>
        </div>
        <div class="space-y-1 max-h-48 overflow-y-auto nice-scroll pr-1">
          ${allProjs.map(p => projRow(p, true)).join('') || '<p class="text-xs text-gray-400 px-3">No projects</p>'}
        </div>
      </div>

      <!-- PS Amount section -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-sm inline-block flex-shrink-0" style="background:#8b5cf6"></span>
            <span class="text-sm font-semibold text-gray-800">PS Amount</span>
            <span class="text-xs text-gray-400">${psProjs.length} PS project${psProjs.length === 1 ? '' : 's'}</span>
          </div>
          <span class="text-sm font-bold text-violet-600 mono">${fmtFull(psAmt)}</span>
        </div>
        <div class="space-y-1 max-h-48 overflow-y-auto nice-scroll pr-1">
          ${psProjs.map(p => projRow(p, false)).join('') || '<p class="text-xs text-gray-400 px-3">No PS projects this FY</p>'}
        </div>
      </div>

      <!-- PS Share % calculation -->
      <div class="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <div class="flex items-center gap-2 mb-3">
          <span class="w-3 h-3 rounded-sm inline-block flex-shrink-0" style="background:#10b981"></span>
          <span class="text-sm font-semibold text-emerald-800">PS Share % — Calculation</span>
        </div>
        <div class="font-mono text-sm text-emerald-900 space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-emerald-700">PS Amount (Product Amount first, Amount fallback from PS rows)</span>
            <span class="font-bold">${fmtFull(psAmt)}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-emerald-700">Total Amount (Product Amount first, Amount fallback)</span>
            <span class="font-bold">${fmtFull(totalAmt)}</span>
          </div>
          <div class="border-t border-emerald-200 my-2"></div>
          <div class="flex items-center justify-between text-base">
            <span class="text-emerald-700">${fmtFull(psAmt)} ÷ ${fmtFull(totalAmt)} × 100</span>
            <span class="font-bold text-emerald-800 text-lg">${pct.toFixed(1)}%</span>
          </div>
        </div>
      </div>

    </div>
    <div class="px-6 py-4 border-t border-gray-100 flex justify-end bg-gray-50 rounded-b-2xl">
      <button onclick="closeModal()" class="btn-gray">Close</button>
    </div>`, 'max-w-xl');
}


