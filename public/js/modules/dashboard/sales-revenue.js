/* ================================================================ FILTERED REVENUE CHART */
function renderPsRevenueChart(data, prodFilter) {
  if (data && typeof data === 'object') S.psRevenueData = data;
  if (!S.psRevenueData || typeof S.psRevenueData !== 'object') S.psRevenueData = { ALL: [] };
  if (prodFilter !== undefined) S.nlProductFilter = prodFilter instanceof Set ? prodFilter : new Set([prodFilter]);

  const pf = S.nlProductFilter instanceof Set && S.nlProductFilter.size
    ? S.nlProductFilter
    : new Set(['ALL']);
  const selectedCategories = [...pf];
  const isAllMode = selectedCategories.includes('ALL');
  const categories = isAllMode ? ['ALL'] : selectedCategories;
  const categoryLabels = {
    ALL: 'All Categories',
    ALLCLEAN: 'All w/o Personal & Student',
    SOFTWARE: 'Software',
    PS: 'PS Only',
    PERSONAL: 'Personal Use',
    STUDENT: 'Student Use',
  };
  const selectedCategoryLabel = isAllMode
    ? categoryLabels.ALL
    : categories.map(category => categoryLabels[category] || category).join(' + ');
  const datasetLabel = isAllMode
    ? 'All Categories Revenue'
    : categories.length === 1
      ? `${selectedCategoryLabel} Revenue`
      : 'Selected Categories Revenue';

  // Merge the selected category datasets by fiscal year. Multi-select mode
  // de-duplicates projects so overlapping category filters never double-count.
  const fyMap = {};
  for (const category of categories) {
    const categoryData = Array.isArray(S.psRevenueData[category]) ? S.psRevenueData[category] : [];
    for (const fiscalYear of categoryData) {
      const key = Number(fiscalYear?.fy);
      if (!Number.isFinite(key)) continue;
      if (!fyMap[key]) {
        fyMap[key] = {
          fy: key,
          label: fiscalYear?.label || `FY ${key}`,
          total_amount: 0,
          all_projects: [],
          category_label: selectedCategoryLabel,
        };
      }

      const entry = fyMap[key];
      if (isAllMode || categories.length === 1) {
        entry.total_amount = Number(fiscalYear?.total_amount) || 0;
        entry.all_projects = Array.isArray(fiscalYear?.all_projects) ? fiscalYear.all_projects : [];
        continue;
      }

      const seenProjects = new Set(entry.all_projects.map(project => Number(project?.id)));
      for (const project of (Array.isArray(fiscalYear?.all_projects) ? fiscalYear.all_projects : [])) {
        const projectKey = Number(project?.id);
        if (!Number.isFinite(projectKey) || seenProjects.has(projectKey)) continue;
        seenProjects.add(projectKey);
        entry.all_projects.push(project);
        entry.total_amount += Number(project?.amount) || 0;
      }
    }
  }

  const chartData = Object.values(fyMap).sort((left, right) => left.fy - right.fy);

  // Sync category buttons.
  document.querySelectorAll('.nl-prod-btn').forEach(button => {
    const isActive = pf.has(button.dataset.prod);
    button.style.background = isActive ? '#1e40af' : 'white';
    button.style.color = isActive ? 'white' : '#374151';
    button.style.borderColor = isActive ? '#1e40af' : '#e5e7eb';
  });

  const title = document.getElementById('psRevenueChartTitle');
  if (title) title.textContent = `${selectedCategoryLabel} Revenue by Fiscal Year`;
  const subtitle = document.getElementById('psRevenueChartSubtitle');
  if (subtitle) subtitle.textContent = 'Closed Won · selected category revenue amount · grouped by Fiscal Period';

  if (S.charts.psRevenue) S.charts.psRevenue.destroy();
  const canvas = document.getElementById('psRevenueChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const fmtUsdK = value => {
    const numericValue = Number(value) || 0;
    if (numericValue >= 1_000_000) return '$' + (numericValue / 1_000_000).toFixed(2) + 'M';
    if (numericValue >= 1_000) return '$' + (numericValue / 1_000).toFixed(1) + 'K';
    return '$' + numericValue.toFixed(0);
  };

  const revenueGradient = ctx.createLinearGradient(0, 0, 0, 300);
  revenueGradient.addColorStop(0, 'rgba(99,102,241,0.92)');
  revenueGradient.addColorStop(1, 'rgba(139,92,246,0.58)');

  const labelPlugin = {
    id: 'filteredRevenueBarLabel',
    afterDatasetsDraw(chart) {
      const { ctx: chartContext } = chart;
      const dataset = chart.data.datasets[0];
      const metadata = chart.getDatasetMeta(0);
      metadata.data.forEach((bar, index) => {
        const value = Number(dataset.data[index]) || 0;
        const { x, y } = bar.getProps(['x', 'y'], true);
        chartContext.save();
        chartContext.fillStyle = '#1f2937';
        chartContext.font = 'bold 11px Inter,sans-serif';
        chartContext.textAlign = 'center';
        chartContext.textBaseline = 'bottom';
        chartContext.fillText(fmtUsdK(value), x, y - 3);
        chartContext.restore();
      });
    }
  };

  S.charts.psRevenue = new Chart(ctx, {
    type: 'bar',
    plugins: [labelPlugin],
    data: {
      labels: chartData.map(item => item.label),
      datasets: [{
        label: datasetLabel,
        data: chartData.map(item => Number(item.total_amount) || 0),
        backgroundColor: revenueGradient,
        hoverBackgroundColor: '#7c3aed',
        borderRadius: 6,
        borderSkipped: false,
        barPercentage: 0.72,
        categoryPercentage: 0.7,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (event, elements) => {
        if (!elements.length) return;
        const index = elements[0].index;
        if (chartData[index]) openRevenueModal(chartData[index]);
      },
      onHover: (event, elements) => {
        const target = event.native?.target;
        if (target) target.style.cursor = elements.length ? 'pointer' : 'default';
      },
      layout: { padding: { top: 28, left: 4, right: 4, bottom: 0 } },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            boxWidth: 12,
            boxHeight: 12,
            padding: 18,
            font: { size: 12, weight: '600' },
            generateLabels: () => [{
              text: datasetLabel,
              fillStyle: '#7c3aed',
              strokeStyle: 'transparent',
              index: 0,
            }]
          }
        },
        tooltip: {
          bodyFont: { size: 12 },
          titleFont: { size: 12, weight: '600' },
          padding: 12,
          callbacks: {
            title: items => items[0].label,
            label: context => `  ${datasetLabel}: ${fmtUsdK(context.parsed.y)}`,
          }
        },
      },
      scales: {
        x: {
          ticks: { font: { size: 13, weight: '600' }, color: '#374151' },
          grid: { display: false },
          border: { display: false },
        },
        y: {
          type: 'linear',
          position: 'left',
          beginAtZero: true,
          ticks: { font: { size: 11 }, color: '#6B7280', callback: value => fmtUsdK(value) },
          grid: { color: '#F3F4F6' },
          border: { display: false },
          title: { display: true, text: 'Revenue Amount (USD)', font: { size: 11 }, color: '#9CA3AF' },
        },
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
        ? projects.map((project, i) => {
            const projectName = typeof project === 'string' ? project : (project?.name || project?.code || 'Unknown');
            const projectId = typeof project === 'object' && Number.isFinite(Number(project?.id)) ? Number(project.id) : null;
            const clickableClass = projectId ? 'cursor-pointer ps-type-project-row hover:bg-blue-50 hover:border-blue-200' : '';
            const dataAttribute = projectId ? `data-proj-id="${projectId}"` : '';
            return `
            <div class="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-gray-50 border border-gray-100 transition-colors ${clickableClass}" ${dataAttribute}>
              <span class="text-xs font-medium text-gray-400 w-5 flex-shrink-0">${i + 1}.</span>
              <span class="text-sm text-gray-800">${esc(projectName)}</span>
            </div>`;
          }).join('')
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

  document.querySelectorAll('#modalRoot .ps-type-project-row[data-proj-id]').forEach(row => {
    row.addEventListener('click', () => {
      closeModal();
      openProjectModal({ id: Number(row.dataset.projId) });
    });
  });
}

