import {escapeHtml as E} from './match-view.js?v=0.15.33-pages';

export const desktopViewport = matchMedia('(min-width: 960px)');
const selected = new Map();

export function currentDesktopItem(key, ids, preferred = '') {
  const previous = selected.get(key);
  const active = ids.includes(preferred) ? preferred : ids.includes(previous) ? previous : ids[0];
  if (active) selected.set(key, active);
  else selected.delete(key);
  return active;
}

export function desktopTable(key, rows, headings, active, title = '') {
  return `<section class="desktop-table-panel desktop-only">
    ${title ? `<h2>${E(title)}</h2>` : ''}
    <table class="desktop-table" data-desktop-table="${E(key)}" data-desktop-choice-list="${E(key)}">
      <thead><tr>${headings.map(label => `<th scope="col">${E(label)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(({id, label, subtitle, cells, href}) => `<tr data-desktop-choice${id === active ? ' data-desktop-current' : ''}>
        <td>${href
          ? `<a class="desktop-row-control" href="${E(href)}">${E(label)}</a>`
          : `<button class="desktop-row-control" type="button" data-desktop-select="${E(id)}" aria-pressed="${id === active}">${E(label)}</button>`}
          ${subtitle ? `<small>${E(subtitle)}</small>` : ''}
        </td>${cells.map(cell => `<td>${cell}</td>`).join('')}
      </tr>`).join('')}</tbody>
    </table>
  </section>`;
}

export function desktopDetails(key, items, headings, renderCard, preferred = '', renderChoices = desktopTable) {
  const active = currentDesktopItem(key, items.map(item => item.id), preferred);
  return `<div class="desktop-detail-layout" data-desktop-detail="${E(key)}">
    ${renderChoices(key, items, headings, active)}
    <div class="cards desktop-detail-panels">${items.map(item => `<div class="desktop-detail-item" data-desktop-item="${E(item.id)}"${item.id === active ? ' data-desktop-current' : ''}>${renderCard(item)}</div>`).join('')}</div>
  </div>`;
}

export function selectDesktopItem(button) {
  const choices = button.closest('[data-desktop-choice-list]');
  const key = choices?.dataset.desktopChoiceList;
  const id = button.dataset.desktopSelect;
  if (!key || !id) return null;
  selected.set(key, id);
  for (const control of choices.querySelectorAll('[data-desktop-select]')) {
    const active = control.dataset.desktopSelect === id;
    control.setAttribute('aria-pressed', String(active));
    control.closest('[data-desktop-choice]').toggleAttribute('data-desktop-current', active);
  }
  const layout = button.closest('[data-desktop-detail]');
  layout?.querySelectorAll('[data-desktop-item]').forEach(panel => {
    panel.toggleAttribute('data-desktop-current', panel.dataset.desktopItem === id);
  });
  expandDesktopDetails(layout);
  return {key, id};
}

export function expandDesktopDetails(root = document) {
  if (!desktopViewport.matches || !root) return;
  for (const details of root.querySelectorAll('[data-desktop-item][data-desktop-current] .job-list-details')) {
    details.open = true;
  }
}

export function activateDesktopTab(group, active) {
  group.dataset.desktopActive = active;
  for (const button of group.querySelectorAll('[data-desktop-tab]')) {
    button.setAttribute('aria-pressed', String(button.dataset.desktopTab === active));
  }
  for (const panel of group.querySelectorAll('[data-desktop-panel]')) {
    panel.toggleAttribute('data-desktop-current', panel.dataset.desktopPanel === active);
  }
}
