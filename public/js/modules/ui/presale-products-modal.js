/* Workforce Allocation Dashboard — ui/presale-products-modal.js */

let preSaleProductDraftRows = [];
let preSaleProductDraftSequence = 0;
let preSaleProductThresholdDraft = {
  securedMinPercent: 90,
  bestCaseMinPercent: 70,
};

function formatPreSaleProductAmount(value) {
  return `$${(Number(value) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getPreSaleProductByName(name) {
  const target = String(name || '').trim().toLowerCase();
  if (!target) return null;
  return (S.preSaleProducts || []).find(product => (
    String(product.name || '').trim().toLowerCase() === target
  )) || null;
}

function createPreSaleProductDraftRow(product = {}) {
  return {
    key: `presale-product-${++preSaleProductDraftSequence}`,
    id: product.id ?? null,
    name: String(product.name || ''),
    amount: Number(product.amount) || 0,
    percent: Number(product.percent) || 0,
  };
}

function normalizePreSaleProductThresholdDraft(settings = {}) {
  return {
    securedMinPercent: Number(settings.securedMinPercent) || 90,
    bestCaseMinPercent: Number(settings.bestCaseMinPercent) || 70,
  };
}


function comparePreSaleProductDraftRows(a, b) {
  const percentDifference = (Number(b?.percent) || 0) - (Number(a?.percent) || 0);
  if (percentDifference) return percentDifference;

  const nameDifference = String(a?.name || '').localeCompare(
    String(b?.name || ''),
    undefined,
    { sensitivity: 'base' },
  );
  if (nameDifference) return nameDifference;

  return String(a?.key || '').localeCompare(String(b?.key || ''));
}

function sortPreSaleProductRowsByPercent() {
  readPreSaleProductDraftRows();
  preSaleProductDraftRows.sort(comparePreSaleProductDraftRows);
  renderPreSaleProductRows();
}

function readPreSaleProductDraftRows() {
  document.querySelectorAll('[data-presale-product-row]').forEach(row => {
    const draft = preSaleProductDraftRows.find(item => item.key === row.dataset.presaleProductRow);
    if (!draft) return;
    draft.name = row.querySelector('[data-presale-product-name]')?.value || '';
    draft.amount = row.querySelector('[data-presale-product-amount]')?.value || '';
    draft.percent = row.querySelector('[data-presale-product-percent]')?.value || '';
  });
}

function readPreSaleProductThresholdDraft() {
  preSaleProductThresholdDraft = {
    securedMinPercent: document.getElementById('presaleSecuredThreshold')?.value || '',
    bestCaseMinPercent: document.getElementById('presaleBestCaseThreshold')?.value || '',
  };
  return preSaleProductThresholdDraft;
}

function syncPreSaleThresholdPreview() {
  const bestCaseValue = Number(document.getElementById('presaleBestCaseThreshold')?.value);
  const preview = document.getElementById('presaleProspectThresholdPreview');
  if (preview) {
    preview.textContent = Number.isFinite(bestCaseValue)
      ? `< ${bestCaseValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`
      : '< Best Case threshold';
  }
}

function renderPreSaleProductRows() {
  const root = document.getElementById('preSaleProductRows');
  if (!root) return;

  root.innerHTML = preSaleProductDraftRows.length
    ? preSaleProductDraftRows.map((product, index) => `
        <div class="presale-product-row" data-presale-product-row="${esc(product.key)}">
          <div class="presale-product-row__index">${index + 1}</div>
          <div>
            <label class="sr-only" for="presale_name_${index}">Product Name</label>
            <input
              id="presale_name_${index}"
              type="text"
              class="field-input"
              data-presale-product-name
              value="${esc(product.name)}"
              placeholder="Product Name"
              autocomplete="off"
            >
          </div>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
            <label class="sr-only" for="presale_amount_${index}">Amount</label>
            <input
              id="presale_amount_${index}"
              type="number"
              min="0"
              step="0.01"
              class="field-input pl-7 text-right"
              data-presale-product-amount
              value="${esc(Number(product.amount) || 0)}"
              placeholder="0.00"
            >
          </div>
          <div class="relative">
            <label class="sr-only" for="presale_percent_${index}">Percent</label>
            <input
              id="presale_percent_${index}"
              type="number"
              min="0"
              max="100"
              step="0.01"
              class="field-input pr-7 text-right"
              data-presale-product-percent
              value="${esc(Number(product.percent) || 0)}"
              placeholder="0"
              onchange="sortPreSaleProductRowsByPercent()"
            >
            <span class="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
          </div>
          <button
            type="button"
            class="presale-product-row__remove"
            onclick="removePreSaleProductRow('${esc(product.key)}')"
            aria-label="Remove ${esc(product.name || `product row ${index + 1}`)}"
            title="Remove product"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/></svg>
          </button>
        </div>
      `).join('')
    : '<div class="px-6 py-14 text-center text-sm text-gray-400">No products yet. Add a product to begin.</div>';
}

function addPreSaleProductRow() {
  readPreSaleProductDraftRows();
  preSaleProductDraftRows.push(createPreSaleProductDraftRow());
  renderPreSaleProductRows();
  const rows = document.querySelectorAll('[data-presale-product-row]');
  rows[rows.length - 1]?.querySelector('[data-presale-product-name]')?.focus();
}

function removePreSaleProductRow(key) {
  readPreSaleProductDraftRows();
  preSaleProductDraftRows = preSaleProductDraftRows.filter(product => product.key !== key);
  renderPreSaleProductRows();
}

function openPreSaleProductsModal() {
  preSaleProductDraftRows = (S.preSaleProducts || [])
    .map(createPreSaleProductDraftRow)
    .sort(comparePreSaleProductDraftRows);
  preSaleProductThresholdDraft = normalizePreSaleProductThresholdDraft(
    S.preSaleProductThresholds,
  );

  openModal(`
    ${mHdr(
      'Pre-Sale Product',
      'Maintain Product Names, reference amounts, confidence percentages and classification thresholds for Pre-Sale assignments.',
    )}
    <div class="modal-scroll-body nice-scroll presale-products-modal__body">
      <section class="presale-product-thresholds" aria-labelledby="presaleThresholdHeading">
        <div class="presale-product-thresholds__copy">
          <strong id="presaleThresholdHeading">Classification thresholds</strong>
          <span>Percent values are classified automatically throughout the Plan-to-Execution Map.</span>
        </div>
        <label class="presale-product-threshold-field is-secured">
          <span>Secured ≥</span>
          <input
            id="presaleSecuredThreshold"
            type="number"
            min="0.01"
            max="100"
            step="0.01"
            class="field-input"
            value="${esc(preSaleProductThresholdDraft.securedMinPercent)}"
            oninput="syncPreSaleThresholdPreview()"
          >
          <em>%</em>
        </label>
        <label class="presale-product-threshold-field is-best-case">
          <span>Best Case ≥</span>
          <input
            id="presaleBestCaseThreshold"
            type="number"
            min="0"
            max="99.99"
            step="0.01"
            class="field-input"
            value="${esc(preSaleProductThresholdDraft.bestCaseMinPercent)}"
            oninput="syncPreSaleThresholdPreview()"
          >
          <em>%</em>
        </label>
        <div class="presale-product-threshold-field is-prospect" aria-label="Prospect threshold">
          <span>Prospect</span>
          <strong id="presaleProspectThresholdPreview">&lt; ${esc(preSaleProductThresholdDraft.bestCaseMinPercent)}%</strong>
        </div>
      </section>
      <div class="presale-product-table-header">
        <span>#</span>
        <span>Product Name</span>
        <span class="text-right">Amount</span>
        <span class="text-right">Percent</span>
        <span></span>
      </div>
      <div id="preSaleProductRows"></div>
    </div>
    <div class="modal-footer flex items-center justify-between gap-3 rounded-b-2xl border-t border-gray-200 bg-gray-50 p-5">
      <button type="button" onclick="addPreSaleProductRow()" class="btn-gray">+ Add Product</button>
      <div class="flex gap-3">
        <button type="button" onclick="closeModal()" class="btn-gray">Cancel</button>
        <button id="savePreSaleProductsBtn" type="button" onclick="savePreSaleProducts()" class="btn-blue">Save Products</button>
      </div>
    </div>
  `, 'max-w-4xl presale-products-modal-panel');

  renderPreSaleProductRows();
  syncPreSaleThresholdPreview();
}

async function savePreSaleProducts() {
  readPreSaleProductDraftRows();
  const thresholdDraft = readPreSaleProductThresholdDraft();
  const thresholds = {
    securedMinPercent: Number(thresholdDraft.securedMinPercent),
    bestCaseMinPercent: Number(thresholdDraft.bestCaseMinPercent),
  };
  preSaleProductDraftRows.sort(comparePreSaleProductDraftRows);
  const products = preSaleProductDraftRows.map(product => ({
    id: product.id,
    name: String(product.name || '').trim(),
    amount: Number(product.amount),
    percent: Number(product.percent),
  }));

  if (
    !Number.isFinite(thresholds.securedMinPercent) ||
    thresholds.securedMinPercent <= 0 ||
    thresholds.securedMinPercent > 100
  ) {
    toast('Secured threshold must be greater than 0 and no more than 100.', 'error');
    return;
  }
  if (
    !Number.isFinite(thresholds.bestCaseMinPercent) ||
    thresholds.bestCaseMinPercent < 0 ||
    thresholds.bestCaseMinPercent >= thresholds.securedMinPercent
  ) {
    toast('Best Case threshold must be at least 0 and lower than the Secured threshold.', 'error');
    return;
  }

  const invalidIndex = products.findIndex(product => (
    !product.name ||
    !Number.isFinite(product.amount) ||
    product.amount < 0 ||
    !Number.isFinite(product.percent) ||
    product.percent < 0 ||
    product.percent > 100
  ));
  if (invalidIndex !== -1) {
    toast(`Product row ${invalidIndex + 1} requires a name, non-negative amount and Percent from 0 to 100.`, 'error');
    return;
  }

  const duplicateNames = new Set();
  for (const product of products) {
    const key = product.name.toLowerCase();
    if (duplicateNames.has(key)) {
      toast(`Duplicate Pre-Sale Product Name: ${product.name}`, 'error');
      return;
    }
    duplicateNames.add(key);
  }

  const saveButton = document.getElementById('savePreSaleProductsBtn');
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = 'Saving…';
  }

  try {
    S.preSaleProducts = await api('PUT', '/api/presale-products', { products });
    S.preSaleProductThresholds = await api(
      'PUT',
      '/api/presale-product-settings',
      thresholds,
    );
    closeModal();
    if (typeof renderMatrix === 'function') {
      renderMatrix();
    }
    if (typeof renderPlannedActualEffortChart === 'function') {
      renderPlannedActualEffortChart();
    }
    toast('Pre-Sale Products and thresholds saved');
  } catch (error) {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = 'Save Products';
    }
    toast(error.message, 'error');
  }
}
