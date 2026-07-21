/* Workforce Allocation Dashboard — core/api.js */

/* ================================================================ API */
async function api(method, path, body) { const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); if (!r.ok) { const e = await r.json().catch(() => ({ error: r.statusText })); throw new Error(e.error || r.status); } return r.json(); }

/* ================================================================ TOASTS */
function toast(msg, kind = 'success') { const root = document.getElementById('toasts'), c = { success: 'bg-emerald-600', error: 'bg-red-600', info: 'bg-gray-800' }[kind]; const el = document.createElement('div'); el.className = `toast-enter ${c} text-white px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 max-w-xs`; const ic = kind === 'success' ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>' : '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>'; el.innerHTML = `<svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${ic}</svg><span>${esc(msg)}</span>`; root.appendChild(el); setTimeout(() => { el.classList.replace('toast-enter', 'toast-exit'); setTimeout(() => el.remove(), 250); }, 2800); }

