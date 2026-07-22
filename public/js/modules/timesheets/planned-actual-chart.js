/* Workforce Allocation Dashboard — timesheets/planned-actual-chart.js */

let plannedActualFlowResizeTimer = null;
let plannedActualProjectInputTimer = null;
let plannedActualProjectMenuCloseTimer = null;

function normalizePlannedActualProjectInput(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ');
}

function resolvePlannedActualProject(data, value, preferredKey = '') {
  const normalizedKey = normalizePlannedActualProjectInput(preferredKey);
  if (normalizedKey) {
    const keyedProject = data.projects.find(project => (
      normalizePlannedActualProjectInput(project.key) === normalizedKey
    ));
    if (keyedProject) return keyedProject;
  }

  const normalized = normalizePlannedActualProjectInput(value);
  if (!normalized) return null;

  return data.projects.find(project => (
    normalizePlannedActualProjectInput(project.key) === normalized ||
    normalizePlannedActualProjectInput(project.label) === normalized
  )) || null;
}

function getPlannedActualSelection(data) {
  const input = document.getElementById('plannedActualProjectFilter');
  const resolved = resolvePlannedActualProject(
    data,
    input?.value,
    input?.dataset.projectKey,
  );
  return resolved || (!String(input?.value || '').trim() ? data.projects[0] || null : null);
}

function closePlannedActualProjectMenu() {
  const input = document.getElementById('plannedActualProjectFilter');
  const toggle = document.getElementById('plannedActualProjectToggle');
  const menu = document.getElementById('plannedActualProjectMenu');
  if (!menu) return;

  menu.classList.add('hidden');
  input?.setAttribute('aria-expanded', 'false');
  toggle?.setAttribute('aria-expanded', 'false');
}

function renderPlannedActualProjectMenu(data, query = '', showAll = false) {
  const menu = document.getElementById('plannedActualProjectMenu');
  if (!menu) return;

  const normalizedQuery = normalizePlannedActualProjectInput(query);
  const matches = (data.projects || []).filter(project => {
    if (showAll || !normalizedQuery) return true;
    return (
      normalizePlannedActualProjectInput(project.label).includes(normalizedQuery) ||
      normalizePlannedActualProjectInput(project.key).includes(normalizedQuery)
    );
  }).slice(0, 100);

  menu.innerHTML = matches.length
    ? matches.map(project => `
        <button
          type="button"
          class="planned-actual-project-option"
          role="option"
          data-project-key="${esc(project.key)}"
          data-project-label="${esc(project.label)}"
        >${esc(project.label)}</button>
      `).join('')
    : '<div class="planned-actual-project-option-empty">No matching projects</div>';
}

function openPlannedActualProjectMenu({ showAll = false } = {}) {
  clearTimeout(plannedActualProjectMenuCloseTimer);
  const input = document.getElementById('plannedActualProjectFilter');
  const toggle = document.getElementById('plannedActualProjectToggle');
  const menu = document.getElementById('plannedActualProjectMenu');
  if (!input || !menu) return;

  const data = buildPlannedActualEffortData();
  renderPlannedActualProjectMenu(data, input.value, showAll);
  menu.classList.remove('hidden');
  input.setAttribute('aria-expanded', 'true');
  toggle?.setAttribute('aria-expanded', 'true');
}

function selectPlannedActualProjectOption(projectKey, projectLabel) {
  const input = document.getElementById('plannedActualProjectFilter');
  if (!input) return;

  input.value = projectLabel;
  input.dataset.projectKey = projectKey;
  closePlannedActualProjectMenu();
  renderPlannedActualEffortChart();
}

function populatePlannedActualProjectFilter(data) {
  const input = document.getElementById('plannedActualProjectFilter');
  if (!input) return;

  const current = input.value;
  const resolved = resolvePlannedActualProject(data, current, input.dataset.projectKey);

  if (resolved) {
    input.value = resolved.label;
    input.dataset.projectKey = resolved.key;
  } else if (!current.trim() && data.projects[0]) {
    input.value = data.projects[0].label;
    input.dataset.projectKey = data.projects[0].key;
  } else {
    delete input.dataset.projectKey;
  }

  const menu = document.getElementById('plannedActualProjectMenu');
  if (menu && !menu.classList.contains('hidden')) {
    renderPlannedActualProjectMenu(data, input.value);
  }
}

function populatePlannedActualMonthFilter(data) {
  const select = document.getElementById('plannedActualMonthFilter');
  if (!select) return;

  const current = select.value;
  select.innerHTML = '<option value="">All Months</option>' +
    (data.months || []).map(month => (
      `<option value="${esc(month.key)}">${esc(month.label)}</option>`
    )).join('');

  select.value = (data.months || []).some(month => month.key === current) ? current : '';
}

function isPlannedActualPreSaleProject(project) {
  return project?.key === 'work-type:pre-sale';
}

function populatePlannedActualProductFilter(project) {
  const wrap = document.getElementById('plannedActualProductFilterWrap');
  const select = document.getElementById('plannedActualProductFilter');
  const visible = isPlannedActualPreSaleProject(project);
  wrap?.classList.toggle('hidden', !visible);
  if (!select) return;

  if (!visible) {
    select.innerHTML = '<option value="">All Products</option>';
    select.value = '';
    return;
  }

  const current = select.value;
  const products = project.preSaleProducts || [];
  select.innerHTML = '<option value="">All Products</option>' + products.map(product => (
    `<option value="${esc(product.productName)}">${esc(product.productName)}</option>`
  )).join('');
  select.value = products.some(product => product.productName === current) ? current : '';
}

function getPlannedActualProductScope(project) {
  if (!isPlannedActualPreSaleProject(project)) return project;
  const selectedProduct = document.getElementById('plannedActualProductFilter')?.value || '';
  if (!selectedProduct) return project;
  return (project.preSaleProducts || []).find(product => product.productName === selectedProduct) || project;
}

function getPlannedActualScope(project) {
  if (!project) return null;
  const parentLabel = project.label;
  const monthKey = document.getElementById('plannedActualMonthFilter')?.value || '';
  if (!monthKey) {
    return { ...project, label: parentLabel, selectedMonthKey: '', selectedMonthLabel: 'All Months' };
  }

  const month = project.monthly.find(item => item.key === monthKey);
  if (!month) return { ...project, label: parentLabel, selectedMonthKey: '', selectedMonthLabel: 'All Months' };

  return {
    ...project,
    ...month,
    label: parentLabel,
    monthly: [month],
    selectedMonthKey: month.key,
    selectedMonthLabel: month.label,
  };
}

function renderPlannedActualSummary(data, project) {
  const summary = document.getElementById('plannedActualSummary');
  const note = document.getElementById('plannedActualProjectNote');
  if (!summary) return;

  if (!project) {
    summary.innerHTML = '';
    if (note) note.textContent = '';
    return;
  }

  summary.innerHTML = `
    <div class="planned-actual-metric">
      <span>Planned resources</span>
      <strong>${project.plannedResources.length}</strong>
    </div>
    <div class="planned-actual-metric">
      <span>Actual resources</span>
      <strong>${project.actualResources.length}</strong>
    </div>
    <div class="planned-actual-metric">
      <span>Planned effort</span>
      <strong>${esc(formatPlannedActualHours(project.plannedHours))}</strong>
    </div>
    <div class="planned-actual-metric">
      <span>Actual effort</span>
      <strong>${esc(formatPlannedActualHours(project.actualHours))}</strong>
    </div>
    <div class="planned-actual-metric is-budget">
      <span>Planned Budget</span>
      <strong title="${esc(formatPlannedActualBudgetExact(project.plannedBudget))}">${esc(formatPlannedActualBudget(project.plannedBudget))}</strong>
    </div>
    <div class="planned-actual-metric is-budget">
      <span>Actual Budget</span>
      <strong title="${esc(formatPlannedActualBudgetExact(project.actualBudget))}">${esc(formatPlannedActualBudget(project.actualBudget))}</strong>
    </div>
  `;

  if (note) {
    const monthText = project.selectedMonthKey ? ` · ${project.selectedMonthLabel}` : ' · All Months';
    const actualSource = project.actualMatchMode === 'work-type' && project.workType
      ? `actual hours use Time Sheet Work Type “${project.workType}”`
      : 'actual hours use matching Time Sheet project names';
    note.textContent = `FY${data.fiscalYear + 1}${monthText}: planned hours and budget come from weekly Resource Assignments; ${actualSource}. Budgets use each matched resource’s saved designation rate.`;
  }
}

function plannedActualResourceStatus(project, resourceKey, mode) {
  const planned = project.plannedByResource.has(resourceKey);
  const actual = project.actualByResource.has(resourceKey);

  if (planned && actual) return { key: 'retained', label: 'Retained' };
  if (mode === 'planned') return { key: 'removed', label: 'Planned only' };
  return { key: 'added', label: 'Added in delivery' };
}

function plannedActualResourceDelta(project, resourceKey) {
  const planned = Number(project.plannedByResource.get(resourceKey)?.hours) || 0;
  const actual = Number(project.actualByResource.get(resourceKey)?.hours) || 0;
  return +(actual - planned).toFixed(2);
}

function plannedActualInitials(name) {
  if (typeof inits === 'function') return inits(name);

  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0] || '')
    .join('')
    .toUpperCase() || '?';
}

function renderPlannedActualResourceCard(project, resource, mode, totalHours) {
  const status = plannedActualResourceStatus(project, resource.key, mode);
  const color = plannedActualResourceColor(resource.key);
  const share = totalHours > 0 ? (resource.hours / totalHours) * 100 : 0;
  const delta = plannedActualResourceDelta(project, resource.key);
  const deltaText = status.key === 'retained'
    ? `${delta > 0 ? '+' : ''}${formatPlannedActualHours(delta)} vs plan`
    : status.label;

  return `
    <article
      class="planned-actual-person is-${status.key}"
      data-resource-key="${esc(resource.key)}"
      data-hours="${Number(resource.hours) || 0}"
      style="--resource-color:${color}"
      title="${esc(resource.name)} · ${esc(formatPlannedActualHours(resource.hours))} · ${esc(deltaText)}"
    >
      <div class="planned-actual-avatar">${esc(plannedActualInitials(resource.name))}</div>
      <div class="planned-actual-person-copy">
        <strong>${esc(resource.name)}</strong>
        <span>${esc(deltaText)}</span>
      </div>
      <div class="planned-actual-person-effort">
        <strong>${esc(formatPlannedActualHours(resource.hours))}</strong>
        <span>${share.toFixed(1)}%</span>
      </div>
    </article>
  `;
}

function renderPlannedActualTeam(project, mode) {
  const planned = mode === 'planned';
  const resources = planned ? project.plannedResources : project.actualResources;
  const totalHours = planned ? project.plannedHours : project.actualHours;
  const title = planned ? 'Planned team' : 'Actual delivery team';
  const subtitle = planned
    ? 'Resource Assignment'
    : 'Work Summary Time Sheet';
  const showPreSaleAmount = Boolean(project.preSaleContext);
  const amount = planned ? project.plannedBudget : project.actualBudget;

  return `
    <section class="planned-actual-team is-${mode}">
      <header class="planned-actual-team-header">
        <div>
          <span>${esc(subtitle)}</span>
          <h4>${esc(title)}</h4>
        </div>
        <div class="planned-actual-team-total">
          <strong>${esc(formatPlannedActualHours(totalHours))}</strong>
          <span>${resources.length} resource${resources.length === 1 ? '' : 's'}</span>
          ${showPreSaleAmount ? `<em title="${esc(formatPlannedActualBudgetExact(amount))}">Amount ${esc(formatPlannedActualBudget(amount))}</em>` : ''}
        </div>
      </header>
      <div class="planned-actual-people" data-flow-side="${mode}">
        ${resources.length
          ? resources.map(resource => (
            renderPlannedActualResourceCard(project, resource, mode, totalHours)
          )).join('')
          : `<div class="planned-actual-team-empty">No ${planned ? 'planned assignments' : 'timesheet effort'} recorded</div>`}
      </div>
    </section>
  `;
}

function plannedActualExecutionMessage(project) {
  const retained = project.retainedResources.length;
  const added = project.addedResources.length;
  const removed = project.removedResources.length;

  if (!project.plannedHours && project.actualHours) {
    return `Unplanned delivery by ${project.actualResources.length} resource${project.actualResources.length === 1 ? '' : 's'}`;
  }

  if (!project.actualHours && project.plannedHours) {
    return 'No actual timesheet effort has been recorded';
  }

  return `${retained} retained · ${added} added · ${removed} planned only`;
}

function renderPlannedActualFlow(project) {
  const root = document.getElementById('plannedActualFlow');
  if (!root || !project) return;

  const status = plannedActualStatus(project);
  const statusKey = status.toLowerCase().replace(/\s+/g, '-');
  const varianceDirection = project.varianceHours > 0
    ? 'More effort than planned'
    : project.varianceHours < 0
      ? 'Less effort than planned'
      : 'Delivered exactly on plan';

  root.innerHTML = `
    <div class="planned-actual-flow-layout" id="plannedActualFlowLayout">
      <svg id="plannedActualFlowLinks" class="planned-actual-flow-links" aria-hidden="true"></svg>
      ${renderPlannedActualTeam(project, 'planned')}
      <section class="planned-actual-execution is-${statusKey}" id="plannedActualExecutionNode">
        <span class="planned-actual-status">${esc(status)}</span>
        <div class="planned-actual-project-name">${esc(project.label)}</div>
        ${project.preSaleContext ? `
          <div class="planned-actual-impact" title="${esc(formatPlannedActualBudgetExact(project.preSaleProductAmount))}">
            Impact: ${esc(formatPlannedActualBudget(project.preSaleProductAmount))}
          </div>
        ` : ''}
        <div class="planned-actual-variance-value">
          ${esc(formatPlannedActualVariance(project.varianceHours, project.variancePct))}
        </div>
        <div class="planned-actual-variance-caption">${esc(varianceDirection)}</div>
        <div class="planned-actual-direction" aria-hidden="true">
          <span>Plan</span><i></i><span>Execution</span>
        </div>
        <div class="planned-actual-team-change">${esc(plannedActualExecutionMessage(project))}</div>
      </section>
      ${renderPlannedActualTeam(project, 'actual')}
    </div>
    <div class="planned-actual-flow-legend">
      <span><i class="is-retained"></i> Same resource in plan and execution</span>
      <span><i class="is-removed"></i> Planned but no actual hours</span>
      <span><i class="is-added"></i> Added during execution</span>
      <span>Line thickness represents employee effort.</span>
    </div>
  `;

  requestAnimationFrame(drawPlannedActualFlowLinks);
}

function plannedActualSvgPath(startX, startY, endX, endY) {
  const distance = Math.max(36, Math.abs(endX - startX) * 0.46);
  return `M ${startX} ${startY} C ${startX + distance} ${startY}, ${endX - distance} ${endY}, ${endX} ${endY}`;
}

function drawPlannedActualFlowLinks() {
  const layout = document.getElementById('plannedActualFlowLayout');
  const svg = document.getElementById('plannedActualFlowLinks');
  const center = document.getElementById('plannedActualExecutionNode');
  if (!layout || !svg || !center) return;

  if (window.matchMedia('(max-width: 980px)').matches) {
    svg.innerHTML = '';
    return;
  }

  const layoutRect = layout.getBoundingClientRect();
  const centerRect = center.getBoundingClientRect();
  const width = Math.max(1, layout.clientWidth);
  const height = Math.max(1, layout.scrollHeight);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.innerHTML = '';

  const sides = [
    {
      selector: '[data-flow-side="planned"] .planned-actual-person',
      direction: 'planned',
    },
    {
      selector: '[data-flow-side="actual"] .planned-actual-person',
      direction: 'actual',
    },
  ];

  for (const side of sides) {
    const cards = [...layout.querySelectorAll(side.selector)];
    const total = cards.reduce((sum, card) => sum + (Number(card.dataset.hours) || 0), 0);

    cards.forEach((card, index) => {
      const rect = card.getBoundingClientRect();
      const hours = Number(card.dataset.hours) || 0;
      const color = getComputedStyle(card).getPropertyValue('--resource-color').trim() || '#64748b';
      const spread = cards.length > 1
        ? (index / (cards.length - 1)) - 0.5
        : 0;
      const targetY = (
        centerRect.top - layoutRect.top +
        (centerRect.height / 2) +
        (spread * Math.min(centerRect.height * 0.58, 120))
      );
      const startX = side.direction === 'planned'
        ? rect.right - layoutRect.left
        : centerRect.right - layoutRect.left;
      const startY = side.direction === 'planned'
        ? rect.top - layoutRect.top + rect.height / 2
        : targetY;
      const endX = side.direction === 'planned'
        ? centerRect.left - layoutRect.left
        : rect.left - layoutRect.left;
      const endY = side.direction === 'planned'
        ? targetY
        : rect.top - layoutRect.top + rect.height / 2;
      const share = total > 0 ? hours / total : 0;
      const strokeWidth = Math.max(1.5, Math.min(9, 1.5 + (share * 13)));
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

      path.setAttribute('d', plannedActualSvgPath(startX, startY, endX, endY));
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', plannedActualColorWithAlpha(color, 0.38));
      path.setAttribute('stroke-width', strokeWidth.toFixed(2));
      path.setAttribute('stroke-linecap', 'round');
      svg.appendChild(path);
    });
  }
}

function renderPlannedActualMonthlyChart(project) {
  const canvas = document.getElementById('plannedActualMonthlyChart');
  if (!canvas || !project) return;

  if (S.charts.plannedActualEffort) {
    S.charts.plannedActualEffort.destroy();
    S.charts.plannedActualEffort = null;
  }

  const chart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: project.monthly.map(month => month.label),
      datasets: [
        {
          label: 'Planned assignment hours',
          data: project.monthly.map(month => month.planned),
          borderColor: '#6366F1',
          backgroundColor: 'rgba(99, 102, 241, 0.10)',
          borderWidth: 2,
          borderDash: [6, 5],
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: '#FFFFFF',
          pointBorderColor: '#6366F1',
          pointBorderWidth: 2,
          tension: 0.32,
          fill: false,
        },
        {
          label: 'Actual timesheet hours',
          data: project.monthly.map(month => month.actual),
          borderColor: '#0F9F79',
          backgroundColor: 'rgba(15, 159, 121, 0.12)',
          borderWidth: 2.5,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: '#FFFFFF',
          pointBorderColor: '#0F9F79',
          pointBorderWidth: 2,
          tension: 0.32,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true,
            boxWidth: 8,
            boxHeight: 8,
            padding: 18,
            color: '#475569',
            font: { size: 11 },
          },
        },
        tooltip: {
          padding: 10,
          callbacks: {
            label(context) {
              return ` ${context.dataset.label}: ${formatPlannedActualHours(context.parsed.y)}`;
            },
            afterBody(items) {
              const month = project.monthly[items[0]?.dataIndex];
              if (!month) return [];
              const sign = month.variance > 0 ? '+' : '';
              return [`Variance: ${sign}${formatPlannedActualHours(month.variance)}`];
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#64748B',
            font: { size: 10 },
            maxRotation: 40,
            minRotation: 0,
          },
        },
        y: {
          beginAtZero: true,
          grid: { color: '#EEF2F7' },
          ticks: {
            color: '#64748B',
            font: { size: 10 },
            callback: value => formatPlannedActualHours(value),
          },
          title: {
            display: true,
            text: 'Effort hours',
            color: '#94A3B8',
            font: { size: 11 },
          },
        },
      },
    },
  });

  S.charts.plannedActualEffort = chart;
}

function renderPlannedActualEffortChart() {
  const empty = document.getElementById('plannedActualEmpty');
  const content = document.getElementById('plannedActualContent');
  const trendPanel = document.getElementById('plannedActualTrendPanel');
  const data = buildPlannedActualEffortData();

  populatePlannedActualProjectFilter(data);
  populatePlannedActualMonthFilter(data);
  const selectedProject = getPlannedActualSelection(data);
  populatePlannedActualProductFilter(selectedProject);
  const productScopedProject = getPlannedActualProductScope(selectedProject);
  const project = getPlannedActualScope(productScopedProject);
  if (project && isPlannedActualPreSaleProject(selectedProject)) {
    project.preSaleContext = true;
    project.label = productScopedProject !== selectedProject
      ? `Pre-Sale — ${productScopedProject.productName}`
      : 'Pre-Sale';
  }
  const hasData = Boolean(project && (project.plannedHours > 0 || project.actualHours > 0));
  const showMonthlyProgression = Boolean(hasData && !project?.selectedMonthKey);

  if (trendPanel) trendPanel.classList.toggle('hidden', !showMonthlyProgression);

  if (empty) {
    empty.classList.toggle('hidden', hasData);
    if (!hasData) {
      const monthText = project?.selectedMonthKey ? ` in ${project.selectedMonthLabel}` : '';
      const projectText = selectedProject?.label ? ` for ${selectedProject.label}` : '';
      empty.textContent = `No planned assignments or Work Summary Time Sheet hours are available${projectText}${monthText}.`;
    }
  }
  if (content) content.classList.toggle('hidden', !hasData);

  renderPlannedActualSummary(data, project);

  if (!hasData) {
    if (S.charts.plannedActualEffort) {
      S.charts.plannedActualEffort.destroy();
      S.charts.plannedActualEffort = null;
    }
    return;
  }

  renderPlannedActualFlow(project);

  if (showMonthlyProgression) {
    renderPlannedActualMonthlyChart(project);
  } else if (S.charts.plannedActualEffort) {
    S.charts.plannedActualEffort.destroy();
    S.charts.plannedActualEffort = null;
  }
}

function initPlannedActualEffortEvents() {
  const projectInput = document.getElementById('plannedActualProjectFilter');
  const projectToggle = document.getElementById('plannedActualProjectToggle');
  const projectMenu = document.getElementById('plannedActualProjectMenu');
  const projectCombobox = document.getElementById('plannedActualProjectCombobox');

  if (projectInput && projectInput.dataset.bound !== '1') {
    projectInput.dataset.bound = '1';

    projectInput.addEventListener('focus', () => {
      openPlannedActualProjectMenu({ showAll: true });
    });

    projectInput.addEventListener('input', () => {
      delete projectInput.dataset.projectKey;
      clearTimeout(plannedActualProjectInputTimer);
      openPlannedActualProjectMenu();
      plannedActualProjectInputTimer = setTimeout(() => {
        const data = buildPlannedActualEffortData();
        if (resolvePlannedActualProject(data, projectInput.value)) {
          renderPlannedActualEffortChart();
        }
      }, 120);
    });

    projectInput.addEventListener('change', renderPlannedActualEffortChart);
    projectInput.addEventListener('blur', () => {
      plannedActualProjectMenuCloseTimer = setTimeout(() => {
        closePlannedActualProjectMenu();
        renderPlannedActualEffortChart();
      }, 160);
    });
    projectInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        clearTimeout(plannedActualProjectInputTimer);
        closePlannedActualProjectMenu();
        renderPlannedActualEffortChart();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        openPlannedActualProjectMenu({ showAll: true });
        projectMenu?.querySelector('.planned-actual-project-option')?.focus();
      } else if (event.key === 'Escape') {
        closePlannedActualProjectMenu();
      }
    });
  }

  if (projectToggle && projectToggle.dataset.bound !== '1') {
    projectToggle.dataset.bound = '1';
    projectToggle.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (projectMenu?.classList.contains('hidden')) {
        openPlannedActualProjectMenu({ showAll: true });
        projectInput?.focus();
      } else {
        closePlannedActualProjectMenu();
      }
    });
  }

  if (projectMenu && projectMenu.dataset.bound !== '1') {
    projectMenu.dataset.bound = '1';
    projectMenu.addEventListener('mousedown', event => event.preventDefault());
    projectMenu.addEventListener('click', event => {
      const option = event.target.closest('.planned-actual-project-option');
      if (!option) return;
      selectPlannedActualProjectOption(
        option.dataset.projectKey,
        option.dataset.projectLabel,
      );
    });
    projectMenu.addEventListener('keydown', event => {
      const options = [...projectMenu.querySelectorAll('.planned-actual-project-option')];
      const index = options.indexOf(document.activeElement);
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        options[Math.min(index + 1, options.length - 1)]?.focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (index <= 0) projectInput?.focus();
        else options[index - 1]?.focus();
      } else if (event.key === 'Enter' && document.activeElement?.matches('.planned-actual-project-option')) {
        event.preventDefault();
        document.activeElement.click();
      } else if (event.key === 'Escape') {
        closePlannedActualProjectMenu();
        projectInput?.focus();
      }
    });
  }

  if (projectCombobox && document.documentElement.dataset.plannedActualProjectOutsideBound !== '1') {
    document.documentElement.dataset.plannedActualProjectOutsideBound = '1';
    document.addEventListener('click', event => {
      if (!projectCombobox.contains(event.target)) closePlannedActualProjectMenu();
    });
  }

  const monthSelect = document.getElementById('plannedActualMonthFilter');
  if (monthSelect && monthSelect.dataset.bound !== '1') {
    monthSelect.dataset.bound = '1';
    monthSelect.addEventListener('change', renderPlannedActualEffortChart);
  }

  const productSelect = document.getElementById('plannedActualProductFilter');
  if (productSelect && productSelect.dataset.bound !== '1') {
    productSelect.dataset.bound = '1';
    productSelect.addEventListener('change', renderPlannedActualEffortChart);
  }

  if (document.documentElement.dataset.plannedActualResizeBound !== '1') {
    document.documentElement.dataset.plannedActualResizeBound = '1';
    window.addEventListener('resize', () => {
      clearTimeout(plannedActualFlowResizeTimer);
      plannedActualFlowResizeTimer = setTimeout(drawPlannedActualFlowLinks, 120);
    });
  }
}
