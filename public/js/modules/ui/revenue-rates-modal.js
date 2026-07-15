/* Workforce Allocation Dashboard — ui/revenue-rates-modal.js */

const REVENUE_RATE_MODAL_COLUMNS = Object.freeze([
  Object.freeze({ field: 'intrasourcing_rate', label: 'Intrasourcing' }),
  Object.freeze({
    field: 'local_rate',
    label: 'Local / Pre Sale / Training',
  }),
]);

function getRevenueRateModalValue(designation, field) {
  const rate = getRevenueRateForDesignation(designation);
  const value = Number(rate?.[field]);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function renderRevenueRateInput(designation, designationIndex, column) {
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
          data-revenue-designation="${esc(designation)}"
          data-revenue-field="${column.field}"
          value="${getRevenueRateModalValue(designation, column.field)}"
          aria-label="${esc(designation)} ${esc(column.label)} hourly rate"
        >
      </div>
    </td>
  `;
}

function openRevenueRatesModal() {
  const rows = RESOURCE_DESIGNATIONS.map((designation, index) => `
    <tr class="border-b border-gray-100 last:border-0">
      <td class="sticky left-0 z-[1] bg-white px-4 py-3 text-sm font-semibold text-gray-800">
        ${esc(designation)}
      </td>
      ${REVENUE_RATE_MODAL_COLUMNS.map(column =>
        renderRevenueRateInput(designation, index, column),
      ).join('')}
    </tr>
  `).join('');

  openModal(`
    ${mHdr(
      'Reserve Revenue',
      'Set the Intrasourcing rate and the shared Local / Pre Sale / Training rate for each designation.',
    )}

    <div class="p-6">
      <div class="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
        One full assignment week equals ${WORK_HOURS_PER_WEEK.toFixed(2)} working hours.
        The Intrasourcing rate applies only to Intrasourcing assignments.
        The Local / Pre Sale / Training rate is shared by those three revenue categories.
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

async function saveRevenueRates() {
  const rates = RESOURCE_DESIGNATIONS.map(designation => {
    const inputs = [...document.querySelectorAll(
      `[data-revenue-designation="${CSS.escape(designation)}"]`,
    )];

    return inputs.reduce((rate, input) => {
      rate[input.dataset.revenueField] = Number(input.value);
      return rate;
    }, { designation });
  });

  const invalid = rates.some(rate =>
    REVENUE_RATE_MODAL_COLUMNS.some(column =>
      !Number.isFinite(rate[column.field]) || rate[column.field] < 0,
    ),
  );

  if (invalid) {
    toast('Hourly rates must be zero or a positive number.', 'error');
    return;
  }

  const saveButton = document.getElementById('saveRevenueRatesBtn');
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = 'Saving…';
  }

  try {
    S.revenueRates = await api('PUT', '/api/revenue-rates', { rates });
    closeModal();
    renderMatrix();
    if (typeof renderMonthlyPlannedWorkChart === 'function') {
      renderMonthlyPlannedWorkChart();
    }
    toast('Revenue rates saved');
  } catch (error) {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = 'Save Rates';
    }
    toast(error.message, 'error');
  }
}
