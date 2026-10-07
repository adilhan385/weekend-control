/* Weekend Control: all data stays in this browser's localStorage. */
(() => {
  'use strict';

  const STORAGE_KEY = 'weekend-control-v1';
  const app = document.querySelector('#app');
  const topActions = document.querySelector('#top-actions');
  const modalRoot = document.querySelector('#modal-root');
  const toastRoot = document.querySelector('#toast-root');
  const STATUS = {
    stay: { label: 'Остаётся', plural: 'Остаются', dot: 'green' },
    leave: { label: 'Уезжает', plural: 'Уезжают', dot: 'red' },
    unknown: { label: 'Ещё неизвестно', plural: 'Неизвестно', dot: 'yellow' }
  };
  let data = load();
  let filter = 'all';
  let query = '';
  let selected = new Set();
  let lastChange = null;
  let toastTimer;

  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (parsed && Array.isArray(parsed.classes)) {
        parsed.classes = parsed.classes.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string' && Array.isArray(item.students)).map(item => ({
          ...item,
          students: item.students.filter(student => student && typeof student.id === 'string'),
          weeks: item.weeks && typeof item.weeks === 'object' && !Array.isArray(item.weeks) ? item.weeks : {}
        }));
        parsed.selectedWeeks = parsed.selectedWeeks && typeof parsed.selectedWeeks === 'object' ? parsed.selectedWeeks : {};
        if (!parsed.classes.some(item => item.id === parsed.activeClassId)) parsed.activeClassId = parsed.classes[0]?.id || null;
        return parsed;
      }
    } catch (_) { /* Start empty if browser data is unavailable or malformed. */ }
    return { classes: [], activeClassId: null, selectedWeeks: {} };
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch (_) { showToast('Не удалось сохранить данные в этом браузере'); }
  }
  function id() { return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
  function activeClass() { return data.classes.find(item => item.id === data.activeClassId) || null; }
  function iso(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
  function fromIso(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d, 12); }
  function currentFriday() {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    today.setDate(today.getDate() - ((today.getDay() + 2) % 7));
    return iso(today);
  }
  function selectedWeek(cls) { return data.selectedWeeks[cls.id] || currentFriday(); }
  function ensureWeek(cls, key) { if (!cls.weeks[key] || typeof cls.weeks[key] !== 'object') cls.weeks[key] = {}; }
  function weekText(key) {
    const start = fromIso(key);
    const end = new Date(start);
    end.setDate(end.getDate() + 2);
    const month = d => new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' }).format(d).replace(/^\d+\s*/, '');
    return start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
      ? `${start.getDate()}–${end.getDate()} ${month(end)}`
      : `${start.getDate()} ${month(start)} – ${end.getDate()} ${month(end)}`;
  }
  function statusOf(cls, week, studentId) { return STATUS[cls.weeks[week]?.[studentId]] ? cls.weeks[week][studentId] : 'unknown'; }
  function counts(cls, week) {
    const result = { total: cls.students.length, stay: 0, leave: 0, unknown: 0 };
    cls.students.forEach(student => result[statusOf(cls, week, student.id)]++);
    return result;
  }
  function visibleStudents(cls, week) {
    const q = query.trim().toLocaleLowerCase('ru');
    return [...cls.students].sort((a, b) => `${a.last} ${a.first}`.localeCompare(`${b.last} ${b.first}`, 'ru'))
      .filter(student => (filter === 'all' || statusOf(cls, week, student.id) === filter) && `${student.last} ${student.first}`.toLocaleLowerCase('ru').includes(q));
  }
  function button(action, label, extra = '') { return `<button type="button" class="btn ${extra}" data-action="${action}">${label}</button>`; }

  function render() {
    const cls = activeClass();
    topActions.innerHTML = cls ? `${button('classes', 'Мои классы')}${button('history', 'История', 'btn-quiet')}` : '';
    if (!cls) {
      app.innerHTML = `<div class="main welcome"><section class="card welcome-card"><div class="welcome-art" aria-hidden="true">🏫</div><p class="eyebrow">Учёт учащихся на выходные</p><h1>👋 Добро пожаловать!</h1><p>Создайте свой класс и добавьте учеников, чтобы начать.</p>${button('create-class', '+ Создать класс', 'btn-primary')}</section></div>`;
      return;
    }
    const week = selectedWeek(cls);
    ensureWeek(cls, week);
    const c = counts(cls, week);
    app.innerHTML = `<div class="main">
      <div class="page-head"><div><p class="eyebrow">Учёт учащихся на выходные</p><h1 class="title">${esc(cls.name)}</h1><p class="subtitle">Выходные: ${esc(weekText(week))}</p><div class="week-switch">${button('prev-week', '← Предыдущие', 'btn-small')}<span class="week-label">${esc(weekText(week))}</span>${button('next-week', 'Следующие →', 'btn-small')}</div></div><div class="head-actions"><span class="date-pill">${esc(weekText(week))}</span></div></div>
      <section class="stats" aria-label="Статистика"><div class="card stat"><div class="stat-label">👥 Всего</div><div class="stat-value">${c.total}</div></div><div class="card stat stat-green"><div class="stat-label"><i class="dot green"></i> Остаются</div><div class="stat-value">${c.stay}</div></div><div class="card stat stat-red"><div class="stat-label"><i class="dot red"></i> Уезжают</div><div class="stat-value">${c.leave}</div></div><div class="card stat stat-yellow"><div class="stat-label"><i class="dot yellow"></i> Неизвестно</div><div class="stat-value">${c.unknown}</div></div></section>
      <button type="button" class="attention ${c.unknown === 0 ? 'done' : ''}" data-action="attention"><span class="attention-icon">${c.unknown === 0 ? '✓' : '⚠'}</span><span><strong>${c.unknown === 0 ? 'Все ученики определились' : 'Требуют внимания'}</strong><small>${c.unknown === 0 ? 'Неизвестных статусов нет' : `${c.unknown} ${plural(c.unknown, 'ученик ещё не определился', 'ученика ещё не определились', 'учеников ещё не определились')}`}</small></span><span class="attention-chevron">›</span></button>
      <section aria-labelledby="students-heading"><div class="section-head"><h2 id="students-heading">Ученики</h2><div class="section-actions">${button('add-student', '+ Добавить ученика', 'btn-primary')}${button('add-many', '+ Добавить несколько')}</div></div><div id="student-area"></div></section>
    </div>`;
    renderStudentArea();
  }

  function plural(n, one, few, many) { const a = n % 10, b = n % 100; return b >= 11 && b <= 14 ? many : a === 1 ? one : a >= 2 && a <= 4 ? few : many; }
  function renderStudentArea() {
    const cls = activeClass();
    if (!cls) return;
    const week = selectedWeek(cls);
    const area = document.querySelector('#student-area');
    if (!area) return;
    if (!cls.students.length) {
      area.innerHTML = `<div class="card empty"><span class="empty-icon">👥</span><h3>В этом классе пока нет учеников</h3><p>Добавьте учеников, чтобы начать работу.</p><div class="empty-actions">${button('add-student', '+ Добавить ученика', 'btn-primary')}${button('add-many', '+ Добавить несколько')}</div></div>`;
      return;
    }
    const students = visibleStudents(cls, week);
    const allChecked = students.length > 0 && students.every(student => selected.has(student.id));
    const filters = [['all', 'Все'], ['stay', '🟢 Остаются'], ['leave', '🔴 Уезжают'], ['unknown', '🟡 Неизвестно']]
      .map(([key, label]) => `<button type="button" class="filter ${filter === key ? 'active' : ''}" data-action="filter" data-filter="${key}" aria-pressed="${filter === key}">${label}</button>`).join('');
    area.innerHTML = `<div class="toolbar"><label class="search-wrap"><span aria-hidden="true">⌕</span><input class="search" id="search" type="search" autocomplete="off" placeholder="Поиск ученика..." aria-label="Поиск ученика" value="${esc(query)}"></label><label class="select-all"><input id="select-all" type="checkbox" ${allChecked ? 'checked' : ''} ${students.length ? '' : 'disabled'}> Выбрать всех</label></div><div class="filters" aria-label="Фильтр учеников">${filters}</div>
      ${students.length ? `<div class="student-list">${students.map(student => `<article class="card student"><input class="student-check" type="checkbox" data-id="${student.id}" aria-label="Выбрать ${esc(student.last)} ${esc(student.first)}" ${selected.has(student.id) ? 'checked' : ''}><div><div class="student-name">${esc(student.last)} ${esc(student.first)}</div><div class="student-class">${esc(cls.name)}</div></div><select class="status-select ${statusOf(cls, week, student.id)}" data-id="${student.id}" aria-label="Статус ${esc(student.last)} ${esc(student.first)}">${Object.entries(STATUS).map(([key, value]) => `<option value="${key}" ${statusOf(cls, week, student.id) === key ? 'selected' : ''}>${key === 'stay' ? '🟢' : key === 'leave' ? '🔴' : '🟡'} ${value.label}</option>`).join('')}</select><div class="row-actions"><button type="button" class="icon-btn" data-action="edit-student" data-id="${student.id}" title="Редактировать" aria-label="Редактировать ${esc(student.last)} ${esc(student.first)}">✎</button><button type="button" class="icon-btn delete" data-action="delete-student" data-id="${student.id}" title="Удалить" aria-label="Удалить ${esc(student.last)} ${esc(student.first)}">🗑</button></div></article>`).join('')}</div>` : `<div class="card empty"><span class="empty-icon">🔍</span><h3>Ученики не найдены</h3><p>Попробуйте другой запрос или фильтр.</p></div>`}
      ${selected.size ? `<div class="bulk" role="region" aria-label="Массовое изменение"><strong>Выбрано: ${selected.size}</strong>${button('bulk-stay', '🟢 Остаются', 'btn-small')}${button('bulk-leave', '🔴 Уезжают', 'btn-small')}${button('bulk-unknown', '🟡 Неизвестно', 'btn-small')}<button type="button" class="icon-btn" data-action="clear-selection" title="Снять выбор" aria-label="Снять выбор">×</button></div>` : ''}`;
  }

  function showToast(message, undo = false) {
    clearTimeout(toastTimer);
    toastRoot.innerHTML = `<div class="toast"><span>${esc(message)}</span>${undo ? '<button type="button" data-action="undo">↩ Отменить</button>' : ''}</div>`;
    toastTimer = setTimeout(() => { toastRoot.innerHTML = ''; }, undo ? 8000 : 4000);
  }
  function closeModal() { modalRoot.innerHTML = ''; document.body.style.overflow = ''; }
  function openModal(title, body, wide = false) {
    modalRoot.innerHTML = `<div class="modal-backdrop" data-action="backdrop"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-top"><h2 id="modal-title">${title}</h2><button type="button" class="icon-btn" data-action="close-modal" aria-label="Закрыть">×</button></div>${body}</div></div>`;
    document.body.style.overflow = 'hidden';
    modalRoot.querySelector('input,textarea,button:not([data-action="close-modal"])')?.focus();
  }
  function formActions(submit, danger = false) { return `<div class="form-error" id="form-error" role="alert"></div><div class="modal-actions">${button('close-modal', 'Отмена')}<button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="submit">${submit}</button></div>`; }
  function formError(message) { const el = document.querySelector('#form-error'); if (el) el.textContent = message; }

  function classForm(cls = null) {
    openModal(cls ? 'Переименовать класс' : 'Создать класс', `<form id="class-form" data-id="${cls?.id || ''}"><div class="field"><label for="class-name">Название класса</label><input id="class-name" name="name" maxlength="60" placeholder="Например, 10 Б" value="${esc(cls?.name || '')}" required></div>${formActions(cls ? 'Сохранить' : 'Создать класс')}</form>`);
  }
  function studentForm(student = null) {
    openModal(student ? 'Редактировать ученика' : 'Добавить ученика', `<form id="student-form" data-id="${student?.id || ''}"><div class="field"><label for="last-name">Фамилия</label><input id="last-name" name="last" maxlength="80" value="${esc(student?.last || '')}" required></div><div class="field"><label for="first-name">Имя</label><input id="first-name" name="first" maxlength="80" value="${esc(student?.first || '')}" required></div>${formActions(student ? 'Сохранить' : 'Добавить')}</form>`);
  }
  function manyForm() {
    openModal('Добавить несколько учеников', `<form id="many-form"><p>Вставьте список: одна строка — один ученик. Сначала фамилия, затем имя.</p><div class="field"><label for="many-names">Список учеников</label><textarea id="many-names" name="names" placeholder="Иванов Иван&#10;Петров Артём&#10;Сидоров Максим" required></textarea><div class="hint">Пустые строки пропускаются.</div></div>${formActions('Добавить')}</form>`, true);
  }
  function confirmDelete(kind, object) {
    const student = kind === 'student';
    openModal(student ? 'Удалить ученика?' : 'Удалить класс?', `<form id="delete-form" data-kind="${kind}" data-id="${object.id}"><p>${student ? `«${esc(object.last)} ${esc(object.first)}»` : `«${esc(object.name)}»`} будет удалён${student ? '' : ' вместе со списком учеников и статусами'}. Это действие нельзя будет отменить.</p>${formActions('Удалить', true)}</form>`);
  }
  function classesModal() {
    openModal('Мои классы', `<div class="class-list">${data.classes.map(cls => `<div class="class-item ${cls.id === data.activeClassId ? 'current' : ''}"><button type="button" class="class-item-main" data-action="switch-class" data-id="${cls.id}">${esc(cls.name)}<small>${cls.students.length} ${plural(cls.students.length, 'ученик', 'ученика', 'учеников')}${cls.id === data.activeClassId ? ' · открыт' : ''}</small></button><button type="button" class="icon-btn" data-action="rename-class" data-id="${cls.id}" aria-label="Переименовать ${esc(cls.name)}" title="Переименовать">✎</button><button type="button" class="icon-btn delete" data-action="delete-class" data-id="${cls.id}" aria-label="Удалить ${esc(cls.name)}" title="Удалить">🗑</button></div>`).join('')}</div><div class="modal-actions">${button('create-class', '+ Создать класс', 'btn-primary')}</div>`);
  }
  function historyModal() {
    const cls = activeClass();
    const weeks = Object.keys(cls.weeks).sort((a, b) => b.localeCompare(a));
    openModal('История недель', weeks.length ? `<div class="history-list">${weeks.map(key => { const c = counts(cls, key); return `<div class="history-item"><strong>${esc(weekText(key))}${key === selectedWeek(cls) ? ' · сейчас' : ''}</strong><div class="history-stats"><span>🟢 ${c.stay}</span><span>🔴 ${c.leave}</span><span>🟡 ${c.unknown}</span></div><button type="button" class="btn btn-small" data-action="open-week" data-week="${key}">Открыть</button></div>`; }).join('')}</div>` : `<div class="history-empty">Пока нет сохранённых недель.</div>`, true);
  }
  function changeStatuses(ids, next) {
    const cls = activeClass(), week = selectedWeek(cls);
    ensureWeek(cls, week);
    const changes = ids.filter(studentId => cls.students.some(student => student.id === studentId)).map(studentId => ({ id: studentId, before: statusOf(cls, week, studentId) })).filter(item => item.before !== next);
    if (!changes.length) return;
    changes.forEach(item => { cls.weeks[week][item.id] = next; });
    lastChange = { classId: cls.id, week, changes };
    save(); render(); showToast(ids.length > 1 ? 'Статусы изменены' : 'Статус изменён', true);
  }
  function undo() {
    if (!lastChange) return;
    const cls = data.classes.find(item => item.id === lastChange.classId);
    if (cls) { ensureWeek(cls, lastChange.week); lastChange.changes.forEach(item => { if (item.before === 'unknown') delete cls.weeks[lastChange.week][item.id]; else cls.weeks[lastChange.week][item.id] = item.before; }); save(); }
    lastChange = null; toastRoot.innerHTML = ''; render(); showToast('Изменение отменено');
  }
  function shiftWeek(days) {
    const cls = activeClass(), next = fromIso(selectedWeek(cls));
    next.setDate(next.getDate() + days);
    data.selectedWeeks[cls.id] = iso(next);
    ensureWeek(cls, data.selectedWeeks[cls.id]);
    selected.clear(); filter = 'all'; query = '';
    save(); render();
  }

  document.addEventListener('click', event => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'backdrop' && event.target !== target) return;
    const cls = activeClass();
    if (action === 'create-class') classForm();
    else if (action === 'classes') classesModal();
    else if (action === 'history') historyModal();
    else if (action === 'close-modal' || action === 'backdrop') closeModal();
    else if (action === 'rename-class') classForm(data.classes.find(item => item.id === target.dataset.id));
    else if (action === 'delete-class') confirmDelete('class', data.classes.find(item => item.id === target.dataset.id));
    else if (action === 'switch-class') { data.activeClassId = target.dataset.id; selected.clear(); query = ''; filter = 'all'; save(); closeModal(); render(); }
    else if (action === 'prev-week') shiftWeek(-7);
    else if (action === 'next-week') shiftWeek(7);
    else if (action === 'open-week') { data.selectedWeeks[cls.id] = target.dataset.week; selected.clear(); query = ''; filter = 'all'; save(); closeModal(); render(); }
    else if (action === 'attention') { filter = 'unknown'; renderStudentArea(); document.querySelector('#students-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else if (action === 'add-student') studentForm();
    else if (action === 'add-many') manyForm();
    else if (action === 'edit-student') studentForm(cls.students.find(item => item.id === target.dataset.id));
    else if (action === 'delete-student') confirmDelete('student', cls.students.find(item => item.id === target.dataset.id));
    else if (action === 'filter') { filter = target.dataset.filter; renderStudentArea(); }
    else if (action === 'clear-selection') { selected.clear(); renderStudentArea(); }
    else if (action.startsWith('bulk-')) { changeStatuses([...selected], action.slice(5)); selected.clear(); renderStudentArea(); }
    else if (action === 'undo') undo();
  });

  document.addEventListener('input', event => {
    if (event.target.id !== 'search') return;
    query = event.target.value;
    const pos = event.target.selectionStart;
    renderStudentArea();
    const input = document.querySelector('#search');
    input?.focus();
    try { input?.setSelectionRange(pos, pos); } catch (_) { /* Search input may not allow selection in some browsers. */ }
  });
  document.addEventListener('change', event => {
    const target = event.target;
    if (target.id === 'select-all') {
      visibleStudents(activeClass(), selectedWeek(activeClass())).forEach(student => target.checked ? selected.add(student.id) : selected.delete(student.id));
      renderStudentArea();
    } else if (target.classList.contains('student-check')) {
      target.checked ? selected.add(target.dataset.id) : selected.delete(target.dataset.id);
      renderStudentArea();
    } else if (target.classList.contains('status-select')) changeStatuses([target.dataset.id], target.value);
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && modalRoot.innerHTML) closeModal(); });
  document.addEventListener('submit', event => {
    const form = event.target;
    if (!['class-form', 'student-form', 'many-form', 'delete-form'].includes(form.id)) return;
    event.preventDefault();
    const cls = activeClass();
    if (form.id === 'class-form') {
      const name = form.elements.name.value.trim().replace(/\s+/g, ' ');
      if (!name) return formError('Укажите название класса.');
      if (data.classes.some(item => item.name.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru') && item.id !== form.dataset.id)) return formError('Класс с таким названием уже есть.');
      if (form.dataset.id) data.classes.find(item => item.id === form.dataset.id).name = name;
      else { const created = { id: id(), name, students: [], weeks: {} }; data.classes.push(created); data.activeClassId = created.id; data.selectedWeeks[created.id] = currentFriday(); ensureWeek(created, data.selectedWeeks[created.id]); selected.clear(); query = ''; filter = 'all'; }
      save(); closeModal(); render(); showToast(form.dataset.id ? 'Класс переименован' : 'Класс создан');
    } else if (form.id === 'student-form') {
      const last = form.elements.last.value.trim().replace(/\s+/g, ' '), first = form.elements.first.value.trim().replace(/\s+/g, ' ');
      if (!last || !first) return formError('Укажите имя и фамилию.');
      if (form.dataset.id) Object.assign(cls.students.find(item => item.id === form.dataset.id), { last, first });
      else cls.students.push({ id: id(), last, first });
      save(); closeModal(); render(); showToast(form.dataset.id ? 'Ученик обновлён' : 'Ученик добавлен');
    } else if (form.id === 'many-form') {
      const lines = form.elements.names.value.split(/\r?\n/).map(line => line.trim().replace(/\s+/g, ' ')).filter(Boolean);
      if (!lines.length) return formError('Введите хотя бы одного ученика.');
      const invalid = lines.findIndex(line => line.split(' ').length < 2);
      if (invalid !== -1) return formError(`Строка ${invalid + 1}: укажите фамилию и имя.`);
      lines.forEach(line => { const [last, ...first] = line.split(' '); cls.students.push({ id: id(), last, first: first.join(' ') }); });
      save(); closeModal(); render(); showToast(`Добавлено: ${lines.length}`);
    } else if (form.id === 'delete-form') {
      if (form.dataset.kind === 'student') {
        cls.students = cls.students.filter(item => item.id !== form.dataset.id);
        Object.values(cls.weeks).forEach(week => delete week[form.dataset.id]);
        selected.delete(form.dataset.id);
        showToast('Ученик удалён');
      } else {
        data.classes = data.classes.filter(item => item.id !== form.dataset.id);
        delete data.selectedWeeks[form.dataset.id];
        if (data.activeClassId === form.dataset.id) data.activeClassId = data.classes[0]?.id || null;
        selected.clear(); query = ''; filter = 'all';
        showToast('Класс удалён');
      }
      lastChange = null; save(); closeModal(); render();
    }
  });
  render();
})();


