/* Workforce Allocation Dashboard — ui/revenue-rates-modal.js */

function getRevenueRateModalValue(designation, field) {
  const rate = getRevenueRateForDesignation(designation);
  const value = Number(rate?.[field]);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function openRevenueRatesModal() {
  const rows = RESOURCE_DESIGNATIONS.map((designation, index) => `
    <tr class="border-b border-gray-100 last:border-0">
      <td class="px-4 py-3 text-sm font-semibold text-gray-800">
        ${esc(designation)}
      </td>
      <td class="px-4 py-3">
        <div class="relative">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
          <input
            id="revenue_ps_${index}"
            type="number"
            min="0"
            step="0.01"
            class="field-input pl-7 text-right"
            data-revenue-designation="${esc(designation)}"
            data-revenue-field="professional_service_rate"
            value="${getRevenueRateModalValue(designation, 'professional_service_rate')}"
            aria-label="${esc(designation)} Professional Service hourly rate"
          >
        </div>
      </td>
      <td class="px-4 py-3">
        <div class="relative">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
          <input
            id="revenue_presale_${index}"
            type="number"
            min="0"
            step="0.01"
            class="field-input pl-7 text-right"
            data-revenue-designation="${esc(designation)}"
            data-revenue-field="pre_sale_rate"
            value="${getRevenueRateModalValue(designation, 'pre_sale_rate')}"
            aria-label="${esc(designation)} Pre Sale hourly rate"
          >
        </div>
      </td>
    </tr>
  `).join('');

  openModal(`
    ${mHdr(
      'Reserve Revenue',
      'Set the hourly Professional Service and Pre Sale rates for each designation.',
    )}

    <div class="p-6">
      <div class="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
        One full assignment week equals 40 working hours. Revenue is recalculated from the selected fiscal year assignments after these rates are saved.
      </div>

      <div class="overflow-x-auto rounded-xl border border-gray-200">
        <table class="w-full min-w-[620px] border-collapse">
          <thead class="bg-gray-50">
            <tr class="border-b border-gray-200">
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500">Designation</th>
              <th class="px-4 py-3 text-right text-xs font-semibold text-gray-500">
                Professional Service ($ / hour)
              </th>
              <th class="px-4 py-3 text-right text-xs font-semibold text-gray-500">
                Pre Sale ($ / hour)
              </th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>

    <div class="flex items-center justify-end gap-3 rounded-b-2xl border-t border-gray-200 bg-gray-50 p-6">
      <button type="button" onclick="closeModal()" class="btn-gray">Cancel</button>
      <button id="saveRevenueRatesBtn" type="button" onclick="saveRevenueRates()" class="btn-blue">
        Save Rates
      </button>
    </div>
  `, 'max-w-3xl');
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
    !Number.isFinite(rate.professional_service_rate) ||
    rate.professional_service_rate < 0 ||
    !Number.isFinite(rate.pre_sale_rate) ||
    rate.pre_sale_rate < 0,
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
    toast('Revenue rates saved');
  } catch (error) {
    toast(error.message, 'error');
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = 'Save Rates';
    }
  }
}
