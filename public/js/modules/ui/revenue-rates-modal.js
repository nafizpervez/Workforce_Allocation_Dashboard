/* Workforce Allocation Dashboard — ui/revenue-rates-modal.js */

const REVENUE_RATE_MODAL_COLUMNS = Object.freeze([
  Object.freeze({ field: 'intrasourcing_rate', label: 'Intra-Sourcing' }),
  Object.freeze({
    field: 'local_rate',
    label: 'Local / Pre-Sale / Training',
  }),
]);

let pendingRevenueRateSave = null;

function getRevenueRateModalValue(rateDesignation, field, draftMap = null) {
  const rate = draftMap?.get(rateDesignation) || getRevenueRateForDesignation(rateDesignation);
  const value = Number(rate?.[field]);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function renderRevenueRateInput(rateDesignation, designationIndex, column, draftMap = null) {
  return `
    <td class="px-3 py-3">
      <div class="relative">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
        <input
          id="revenue_${column.field}_${designationIndex}"
          type="number"
          min="0"
          step="0.01"
          class="field-input pl-7 text-right"
          data-revenue-designation="${esc(rateDesignation)}"
          data-revenue-field="${column.field}"
          value="${getRevenueRateModalValue(rateDesignation, column.field, draftMap)}"
          aria-label="${esc(getRevenueRateGroupLabel(rateDesignation))} ${esc(column.label)} hourly rate"
        >
      </div>
    </td>
  `;
}

function openRevenueRatesModal(draftRates = null) {
  const draftMap = Array.isArray(draftRates)
    ? new Map(draftRates.map(rate => [rate.designation, rate]))
    : null;
  pendingRevenueRateSave = null;
  const rows = REVENUE_RATE_GROUPS.map((group, index) => `
    <tr class="border-b border-gray-100 last:border-0">
      <td class="sticky left-0 z-[1] bg-white px-4 py-3 text-sm font-semibold text-gray-800">
        ${esc(group.label)}
      </td>
      ${REVENUE_RATE_MODAL_COLUMNS.map(column =>
        renderRevenueRateInput(group.rateDesignation, index, column, draftMap),
      ).join('')}
    </tr>
  `).join('');

  openModal(`
    ${mHdr(
      'Resource Revenue',
      'Set the Intra-Sourcing rate and the shared Local / Pre-Sale / Training rate for each designation group.',
    )}

    <div class="p-6">
      <div class="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
        One full assignment week equals ${WORK_HOURS_PER_WEEK.toFixed(2)} working hours.
        Rate changes are date-effective: after editing a rate, you will choose whether it affects future records only or all historical and future records.
        General Admin and Skill Development remain non-revenue.
      </div>

      <div class="nice-scroll overflow-x-auto rounded-xl border border-gray-200">
        <table class="w-full min-w-[680px] border-collapse">
          <thead class="bg-gray-50">
            <tr class="border-b border-gray-200">
              <th class="sticky left-0 z-[2] bg-gray-50 px-4 py-3 text-left text-xs font-semibold text-gray-500">Designation</th>
              ${REVENUE_RATE_MODAL_COLUMNS.map(column => `
                <th class="px-3 py-3 text-right text-xs font-semibold text-gray-500">
                  ${esc(column.label)} ($ / hour)
                </th>
              `).join('')}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>

    <div class="modal-footer flex items-center justify-end gap-3 rounded-b-2xl border-t border-gray-200 bg-gray-50 p-6">
      <button type="button" onclick="closeModal()" class="btn-gray">Cancel</button>
      <button id="saveRevenueRatesBtn" type="button" onclick="saveRevenueRates()" class="btn-blue">
        Save Rates
      </button>
    </div>
  `, 'max-w-4xl');
}

function collectRevenueRateDraft() {
  return REVENUE_RATE_GROUPS.map(group => {
    const designation = group.rateDesignation;
    const inputs = [...document.querySelectorAll(
      `[data-revenue-designation="${CSS.escape(designation)}"]`,
    )];

    return inputs.reduce((rate, input) => {
      rate[input.dataset.revenueField] = Number(input.value);
      return rate;
    }, { designation });
  });
}

function getRevenueRateChanges(rates) {
  const changes = [];
  rates.forEach(rate => {
    const current = getRevenueRateForDesignation(rate.designation) || {};
    REVENUE_RATE_MODAL_COLUMNS.forEach(column => {
      const previous = Number(current[column.field]);
      const next = Number(rate[column.field]);
      if (previous !== next) {
        changes.push({
          designation: rate.designation,
          designationLabel: getRevenueRateGroupLabel(rate.designation),
          field: column.field,
          label: column.label,
          previous: Number.isFinite(previous) ? previous : 0,
          next,
        });
      }
    });
  });
  return changes;
}

function todayRevenueRateDate() {
  const now = new Date();
  const local = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 10);
}

function openRevenueRateChangeScopeModal(rates, changes) {
  pendingRevenueRateSave = { rates, changes };
  const effectiveDate = todayRevenueRateDate();

  openModal(`
    ${mHdr(
      'Apply Rate Changes',
      'Choose whether the new rates preserve historical revenue or recalculate all records.',
    )}

    <div class="p-6">
      <div class="nice-scroll mb-5 max-h-64 overflow-auto rounded-xl border border-gray-200">
        <table class="w-full border-collapse text-sm">
          <thead class="sticky top-0 bg-gray-50">
            <tr class="border-b border-gray-200">
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Designation</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Rate</th>
              <th class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Old</th>
              <th class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">New</th>
            </tr>
          </thead>
          <tbody>
            ${changes.map(change => `
              <tr class="border-b border-gray-100 last:border-0">
                <td class="px-4 py-3 font-semibold text-gray-800">${esc(change.designationLabel || getRevenueRateGroupLabel(change.designation))}</td>
                <td class="px-4 py-3 text-gray-600">${esc(change.label)}</td>
                <td class="px-4 py-3 text-right text-gray-500">$${change.previous.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                <td class="px-4 py-3 text-right font-semibold text-blue-700">$${change.next.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <section class="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div class="mb-2 text-sm font-semibold text-blue-900">Future records only</div>
          <p class="mb-4 text-xs leading-5 text-blue-800">
            Historical assignment and Time Sheet revenue keeps the previous rate. The new rate starts on the selected effective date.
          </p>
          <label class="mb-1 block text-xs font-semibold text-blue-900" for="revenueRateEffectiveDate">Effective from</label>
          <input id="revenueRateEffectiveDate" type="date" min="${effectiveDate}" value="${effectiveDate}" class="field-input mb-4">
          <button type="button" class="btn-blue w-full" onclick="submitRevenueRateChanges('future')">
            Apply to Future Only
          </button>
        </section>

        <section class="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div class="mb-2 text-sm font-semibold text-amber-900">All records</div>
          <p class="mb-4 text-xs leading-5 text-amber-800">
            Recalculate historical and future assignment revenue using the new rate. Use this option for a correction that should replace the old rate everywhere.
          </p>
          <div class="mb-4 rounded-lg border border-amber-200 bg-white/70 px-3 py-2 text-xs font-medium text-amber-900">
            This replaces the saved rate history for the changed designation.
          </div>
          <button type="button" class="btn-gray w-full border-amber-300 text-amber-900" onclick="submitRevenueRateChanges('all')">
            Apply to All Records
          </button>
        </section>
      </div>
    </div>

    <div class="modal-footer flex items-center justify-between rounded-b-2xl border-t border-gray-200 bg-gray-50 p-6">
      <button type="button" onclick="returnToRevenueRatesEditor()" class="btn-gray">Back</button>
      <button type="button" onclick="closeModal()" class="btn-gray">Cancel</button>
    </div>
  `, 'max-w-4xl');
}

function returnToRevenueRatesEditor() {
  const draftRates = pendingRevenueRateSave?.rates || null;
  openRevenueRatesModal(draftRates);
}

async function saveRevenueRates() {
  const rates = collectRevenueRateDraft();
  const invalid = rates.some(rate =>
    REVENUE_RATE_MODAL_COLUMNS.some(column =>
      !Number.isFinite(rate[column.field]) || rate[column.field] < 0,
    ),
  );

  if (invalid) {
    toast('Hourly rates must be zero or a positive number.', 'error');
    return;
  }

  const changes = getRevenueRateChanges(rates);
  if (!changes.length) {
    closeModal();
    toast('No revenue-rate changes to save');
    return;
  }

  openRevenueRateChangeScopeModal(rates, changes);
}

async function submitRevenueRateChanges(applyMode) {
  if (!pendingRevenueRateSave?.rates) {
    toast('The pending rate changes are no longer available. Reopen Resource Revenue.', 'error');
    return;
  }

  const effectiveDate = applyMode === 'future'
    ? document.getElementById('revenueRateEffectiveDate')?.value
    : null;
  if (applyMode === 'future' && !effectiveDate) {
    toast('Choose the date when the new rate becomes effective.', 'error');
    return;
  }

  const buttons = [...document.querySelectorAll('#modalRoot button')];
  buttons.forEach(button => { button.disabled = true; });

  try {
    S.revenueRates = await api('PUT', '/api/revenue-rates', {
      rates: pendingRevenueRateSave.rates,
      apply_mode: applyMode,
      effective_date: effectiveDate,
    });
    pendingRevenueRateSave = null;
    closeModal();
    await loadAll();
    toast(applyMode === 'future'
      ? `Revenue rates will apply from ${effectiveDate}; historical revenue was preserved.`
      : 'Revenue rates were applied to all historical and future records.');
  } catch (error) {
    buttons.forEach(button => { button.disabled = false; });
    toast(error.message, 'error');
  }
}
