/* Workforce Allocation Dashboard — ui/presale-products-modal.js */

let preSaleProductDraftRows = [];
let preSaleProductDraftSequence = 0;

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
  };
}

function readPreSaleProductDraftRows() {
  document.querySelectorAll('[data-presale-product-row]').forEach(row => {
    const draft = preSaleProductDraftRows.find(item => item.key === row.dataset.presaleProductRow);
    if (!draft) return;
    draft.name = row.querySelector('[data-presale-product-name]')?.value || '';
    draft.amount = row.querySelector('[data-presale-product-amount]')?.value || '';
  });
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
  preSaleProductDraftRows = (S.preSaleProducts || []).map(createPreSaleProductDraftRow);

  openModal(`
    ${mHdr(
      'PreSale Product',
      'Maintain the only Product Names and reference amounts allowed for Pre Sale assignments.',
    )}
    <div class="modal-scroll-body nice-scroll presale-products-modal__body">
      <div class="presale-product-table-header">
        <span>#</span>
        <span>Product Name</span>
        <span class="text-right">Amount</span>
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
  `, 'max-w-3xl presale-products-modal-panel');

  renderPreSaleProductRows();
}

async function savePreSaleProducts() {
  readPreSaleProductDraftRows();
  const products = preSaleProductDraftRows.map(product => ({
    id: product.id,
    name: String(product.name || '').trim(),
    amount: Number(product.amount),
  }));

  const invalidIndex = products.findIndex(product => (
    !product.name || !Number.isFinite(product.amount) || product.amount < 0
  ));
  if (invalidIndex !== -1) {
    toast(`Product row ${invalidIndex + 1} requires a name and non-negative amount.`, 'error');
    return;
  }

  const duplicateNames = new Set();
  for (const product of products) {
    const key = product.name.toLowerCase();
    if (duplicateNames.has(key)) {
      toast(`Duplicate PreSale Product Name: ${product.name}`, 'error');
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
    closeModal();
    toast('PreSale Products saved');
  } catch (error) {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = 'Save Products';
    }
    toast(error.message, 'error');
  }
}
