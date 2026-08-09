/* Workforce Allocation Dashboard — ui/committed-targets-modal.js */

const COMMITTED_TARGET_LABELS = Object.freeze({
  intrasourcing: 'Intrasourcing Revenue Target',
  local: 'Local PS Revenue Target',
  local_pipeline: 'Local Pipeline Target',
});

function getCommittedTargetModalAmount(targetKey) {
  const summary = typeof getCommittedTargetSummary === 'function'
    ? getCommittedTargetSummary()
    : { intrasourcing: 0, local: 0, localPipeline: 0 };
  if (targetKey === 'local_pipeline') return Number(summary.localPipeline) || 0;
  return Number(summary[targetKey]) || 0;
}

function getCommittedTargetModalCopy(targetKey) {
  if (targetKey === 'local_pipeline') {
    return {
      subtitle: 'Set the Local Pipeline Target used by Pipeline Target Summary. The value is saved in SQLite and persists after restart.',
      note: 'Local Pipeline Target is a planning-only value. It is not added to the Committed Target KPI amount.',
    };
  }
  return {
    subtitle: 'Set the committed revenue target amount. The value is saved in SQLite and persists after restart.',
    note: 'The Committed Target KPI displays only the sum of the saved Intrasourcing and Local PS revenue targets. Local Pipeline Target is excluded.',
  };
}

function openCommittedTargetModal(targetKey) {
  const label = COMMITTED_TARGET_LABELS[targetKey];
  if (!label) return;

  const amount = getCommittedTargetModalAmount(targetKey);
  const copy = getCommittedTargetModalCopy(targetKey);
  openModal(`
    ${mHdr(label, copy.subtitle)}
    <div class="p-6">
      <label class="block">
        <span class="field-label">Target Amount (USD)</span>
        <div class="relative mt-1">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
          <input
            id="committedTargetAmount"
            type="number"
            min="0"
            step="0.01"
            class="field-input pl-8 text-right text-base font-semibold"
            value="${esc(amount.toFixed(2))}"
            aria-label="${esc(label)} amount"
          >
        </div>
      </label>
      <div class="mt-4 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
        ${esc(copy.note)}
      </div>
    </div>
    <div class="modal-footer flex items-center justify-end gap-3 rounded-b-2xl border-t border-gray-200 bg-gray-50 p-6">
      <button type="button" onclick="closeModal()" class="btn-gray">Cancel</button>
      <button
        id="saveCommittedTargetBtn"
        type="button"
        onclick="saveCommittedTarget('${esc(targetKey)}')"
        class="btn-blue"
      >Save Target</button>
    </div>
  `, 'max-w-md');

  const input = document.getElementById('committedTargetAmount');
  input?.focus();
  input?.select();
  input?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveCommittedTarget(targetKey);
    }
  });
}

async function saveCommittedTarget(targetKey) {
  const amount = Number(document.getElementById('committedTargetAmount')?.value);
  if (!Number.isFinite(amount) || amount < 0) {
    toast('Target amount must be zero or a positive number.', 'error');
    return;
  }

  const saveButton = document.getElementById('saveCommittedTargetBtn');
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = 'Saving…';
  }

  try {
    const saved = await api('PUT', `/api/committed-targets/${targetKey}`, {
      amount,
    });
    const current = Array.isArray(S.committedTargets) ? S.committedTargets : [];
    S.committedTargets = [
      ...current.filter(target => target.target_key !== targetKey),
      saved,
    ];
    closeModal();
    if (typeof renderStats === 'function' && S.dashboardStats) {
      renderStats(S.dashboardStats);
    } else if (typeof renderCapacityExecutiveCards === 'function') {
      renderCapacityExecutiveCards();
    }
    toast(`${COMMITTED_TARGET_LABELS[targetKey]} saved`);
  } catch (error) {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = 'Save Target';
    }
    toast(error.message, 'error');
  }
}
