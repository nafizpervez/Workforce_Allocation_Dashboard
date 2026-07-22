/* Workforce Allocation Dashboard — ui/protected-modal-access.js */

let protectedModalAuthorizedAction = null;

function cancelProtectedModalAccess() {
  protectedModalAuthorizedAction = null;
  closeModal();
}

function requestProtectedModalAccess(modalTitle, onAuthorized) {
  protectedModalAuthorizedAction = typeof onAuthorized === 'function' ? onAuthorized : null;

  openModal(`
    ${mHdr('Password Required', `Enter the configured password to open ${modalTitle}.`)}
    <form id="protectedModalAccessForm" class="p-6">
      <label class="block text-sm font-medium text-gray-700 mb-2" for="protectedModalPassword">
        Password
      </label>
      <input
        id="protectedModalPassword"
        type="password"
        class="field-input"
        autocomplete="current-password"
        required
      >
      <p id="protectedModalAccessError" class="hidden mt-2 text-sm text-red-600"></p>
    </form>
    <div class="modal-footer p-6 border-t border-gray-200 flex items-center justify-end gap-3 bg-gray-50 rounded-b-2xl">
      <button type="button" onclick="cancelProtectedModalAccess()" class="btn-gray">Cancel</button>
      <button id="protectedModalAccessSubmit" type="submit" form="protectedModalAccessForm" class="btn-blue">Open Modal</button>
    </div>
  `, 'max-w-md');

  const form = document.getElementById('protectedModalAccessForm');
  const passwordInput = document.getElementById('protectedModalPassword');
  const errorText = document.getElementById('protectedModalAccessError');
  const submitButton = document.getElementById('protectedModalAccessSubmit');

  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const password = passwordInput?.value || '';
    if (!password) {
      if (errorText) {
        errorText.textContent = 'Password is required.';
        errorText.classList.remove('hidden');
      }
      passwordInput?.focus();
      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Verifying…';
    }
    if (errorText) errorText.classList.add('hidden');

    try {
      await api('POST', '/api/modal-access/verify', { password });
      const action = protectedModalAuthorizedAction;
      protectedModalAuthorizedAction = null;
      closeModal();
      action?.();
    } catch (error) {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Open Modal';
      }
      if (errorText) {
        errorText.textContent = error.message || 'Incorrect password.';
        errorText.classList.remove('hidden');
      }
      if (passwordInput) {
        passwordInput.value = '';
        passwordInput.focus();
      }
    }
  });

  setTimeout(() => passwordInput?.focus(), 0);
}
