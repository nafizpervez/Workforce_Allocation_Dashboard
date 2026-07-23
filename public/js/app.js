/* Application bootstrap: hydrate HTML fragments, then initialize the dashboard. */
async function loadLayoutFragments() {
  while (document.querySelector('[data-fragment]')) {
    const hosts = [...document.querySelectorAll('[data-fragment]')];
    await Promise.all(hosts.map(async host => {
      const response = await fetch(host.dataset.fragment, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`Unable to load ${host.dataset.fragment}`);
      host.outerHTML = await response.text();
    }));
  }
}

async function init() {
  try {
    await loadLayoutFragments();
    initEvents(); 
    await loadAll();
  } catch (error) {
    console.error(error);
    const root = document.getElementById('toasts');
    if (root) root.textContent = `Dashboard initialization failed: ${error.message}`;
  }
}

init();
