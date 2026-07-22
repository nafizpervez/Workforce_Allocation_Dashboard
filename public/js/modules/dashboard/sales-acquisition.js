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
  const fmtFull = value => '$' + (Number(value) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const projectRow = project => `
    <div class="flex items-center justify-between gap-3 py-1.5 px-3 rounded-lg bg-gray-50 border border-gray-100 hover:bg-gray-100 transition-colors">
      <div class="min-w-0">
        <div class="text-xs font-semibold text-gray-800 truncate">${esc(project.name)}</div>
        <div class="text-xs text-gray-400 mono">${esc(project.code)}${project.product_family ? ` · ${esc(project.product_family)}` : ''}</div>
      </div>
      <span class="text-xs font-bold text-gray-700 mono flex-shrink-0">${fmtFull(project.amount)}</span>
    </div>`;

  const projects = Array.isArray(d?.all_projects) ? d.all_projects : [];
  const revenueAmount = Number(d?.total_amount) || 0;
  const categoryLabel = d?.category_label || 'Selected Category';

  openModal(`${mHdr(
    `${d.label} — ${categoryLabel} Revenue`,
    'Closed Won · grouped by Fiscal Period · Product Amount first, then Amount fallback'
  )}
    <div class="p-6 overflow-y-auto nice-scroll" style="max-height:65vh">
      <div class="rounded-xl border border-violet-200 bg-violet-50 p-4 mb-4">
        <div class="flex items-center justify-between gap-4">
          <div>
            <div class="text-xs font-semibold uppercase tracking-wide text-violet-600">${esc(categoryLabel)}</div>
            <div class="text-sm text-violet-800 mt-1">${projects.length} project${projects.length === 1 ? '' : 's'}</div>
          </div>
          <span class="text-xl font-bold text-violet-700 mono">${fmtFull(revenueAmount)}</span>
        </div>
      </div>

      <div class="space-y-1 max-h-96 overflow-y-auto nice-scroll pr-1">
        ${projects.map(projectRow).join('') || '<p class="text-xs text-gray-400 px-3 py-3">No projects for this category and fiscal year.</p>'}
      </div>
    </div>
    <div class="px-6 py-4 border-t border-gray-100 flex justify-end bg-gray-50 rounded-b-2xl">
      <button onclick="closeModal()" class="btn-gray">Close</button>
    </div>`, 'max-w-xl');
}


