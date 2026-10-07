export const columns = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'active', label: 'Active' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
];

export const assignees = ['Mara', 'Theo', 'Inez', 'No owner'];

export const seedCards = [
  { id: 'card-aurora', title: 'Outline onboarding tour', status: 'backlog', assignee: 'Mara', due: '2026-10-04', tags: ['copy', 'ux'], detail: 'Draft the first-run path and empty-state copy for the planner.' },
  { id: 'card-tide', title: 'Ship billing settings polish', status: 'active', assignee: 'Theo', due: '2026-10-02', tags: ['frontend'], detail: 'Tighten spacing, focus states, and save affordances.' },
  { id: 'card-lantern', title: 'QA mobile list density', status: 'review', assignee: 'Inez', due: '2026-10-06', tags: ['qa', 'mobile'], detail: 'Verify list view remains scannable on small screens.' },
  { id: 'card-orbit', title: 'Publish release notes', status: 'done', assignee: 'Mara', due: '2026-09-30', tags: ['docs'], detail: 'Summarize board/list flow and keyboard movement support.' },
  { id: 'card-meadow', title: 'Prototype calendar swimlane', status: 'active', assignee: 'No owner', due: '2026-10-08', tags: ['research'], detail: 'Explore due-date grouping without adding a date library.' },
];

export function cardById(cards, id) {
  return cards.find((card) => card.id === id);
}

export function byDueDate(a, b) {
  return a.due.localeCompare(b.due);
}
