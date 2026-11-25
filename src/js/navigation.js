export function initNavigation() {
  const buttons = [...document.querySelectorAll('[data-section]')];
  const views = [...document.querySelectorAll('[data-view]')];

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.section;
      buttons.forEach((item) => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        if (active) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
      });
      views.forEach((view) => {
        const active = view.dataset.view === target;
        view.hidden = !active;
        view.classList.toggle('is-visible', active);
      });
      history.replaceState(null, '', `#${target}`);
    });
  });

  function openHashSection() {
    const section = location.hash.slice(1);
    const button = buttons.find((item) => item.dataset.section === section);
    if (button) button.click();
  }

  openHashSection();
  window.addEventListener('hashchange', openHashSection);
}
