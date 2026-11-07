/**
 * Pantallas de hábitos: Hoy, Informes, Estadísticas, Grupo y el formulario.
 * La semana va de lunes a domingo.
 */

import {
  HABIT_COLORS,
  HABIT_EMOJIS,
  addEntry,
  bestStreak,
  buildReport,
  clearCheck,
  createHabit,
  currentStreak,
  dayDone,
  dayTotal,
  deleteEntry,
  deleteHabit,
  formatAmount,
  goalForPeriod,
  guessEmoji,
  habitById,
  importAdminSeedIfNeeded,
  loadHabits,
  monthGrid,
  periodRange,
  seedAlreadyImported,
  setShare,
  shareCard,
  sumHabit,
  todayISO,
  typeLabel,
  updateEntry,
  updateHabit,
  validDate,
  yearHeat,
} from "./habitos.js";

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];
const WEEKDAY_NAMES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function shell(ctx, body) {
  ctx.root.innerHTML = "";
  const main = ctx.el(`<main class="app-shell mx-auto w-full max-w-lg"></main>`);
  const box = ctx.el(`<div class="mx-auto flex max-w-lg flex-col gap-4"></div>`);
  box.innerHTML = body;
  main.appendChild(box);
  ctx.root.appendChild(main);
  return box;
}

function niceDate(iso) {
  const date = iso.includes("-") ? new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) : new Date();
  const weekday = WEEKDAY_NAMES[(date.getDay() + 6) % 7];
  return `${weekday} ${date.getDate()} de ${MONTHS[date.getMonth()]}`;
}

function shortDate(iso) {
  const date = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return `${WEEKDAYS[(date.getDay() + 6) % 7]} ${date.getDate()}`;
}

function progressLabel(habit, total) {
  if (habit.goal) return `${trimNum(total)}/${trimNum(habit.goal)}${unitSuffix(habit)}`;
  if (habit.type === "check") return total > 0 ? "Hecho" : "Pendiente";
  if (habit.type === "minutes") return `${trimNum(total)} min`;
  return trimNum(total);
}

function trimNum(n) {
  const rounded = Math.round(Number(n) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function unitSuffix(habit) {
  if (habit.type === "minutes") return " min";
  if (habit.type === "check") return "";
  return "";
}

function fillPct(habit, total) {
  if (habit.goal) return Math.max(0, Math.min(100, Math.round((total / habit.goal) * 100)));
  return total > 0 ? 100 : 0;
}

function ring(ratio, color) {
  const length = 94.2;
  const dash = Math.max(0, Math.min(1, ratio)) * length;
  return `<svg class="day-ring" viewBox="0 0 36 36" aria-hidden="true">
    <circle class="day-ring-track" cx="18" cy="18" r="15"></circle>
    <circle class="day-ring-value tone-${color}" cx="18" cy="18" r="15" style="stroke-dasharray:${dash} ${length}"></circle>
  </svg>`;
}

export function renderHabitScreen(ctx) {
  if (ctx.app.screen === "habit-form") return renderForm(ctx);
  if (ctx.app.screen === "habit") return renderDetail(ctx);
  if (ctx.app.screen === "reports") return renderReports(ctx);
  if (ctx.app.screen === "stats") return renderStats(ctx);
  if (ctx.app.screen === "group") return renderGroup(ctx);
  return renderToday(ctx);
}

function renderToday(ctx) {
  const store = loadHabits();
  const today = todayISO();
  const range = periodRange("semana");
  const dates = [];
  const cursor = new Date(range.start);
  while (cursor <= range.end) {
    dates.push(todayISO(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  const strip = dates
    .map((date) => {
      const day = Number(date.slice(8, 10));
      const letter = WEEKDAYS[(parseWeekIndex(date))];
      const any = store.habits.some((habit) => dayDone(habit, dayTotal(habit.id, date, store.entries)));
      return `<div class="week-day ${date === today ? "is-today" : ""}">
        <span>${letter}</span>
        <strong>${day}</strong>
        ${any ? `<i class="week-dot"></i>` : `<i class="week-dot is-empty"></i>`}
      </div>`;
    })
    .join("");
  const cards = store.habits
    .map((habit) => {
      const total = dayTotal(habit.id, today, store.entries);
      const pct = fillPct(habit, total);
      const streak = currentStreak(habit, store.entries);
      return `<article class="habit-card tone-${habit.color}" data-id="${ctx.escapeHtml(habit.id)}">
        <div class="habit-card-fill" style="width:${pct}%"></div>
        <button type="button" class="habit-card-hit" data-add="${ctx.escapeHtml(habit.id)}" aria-label="Sumar a ${ctx.escapeHtml(habit.name)}">
          <span class="habit-emoji" aria-hidden="true">${habit.emoji}</span>
          <span class="habit-card-copy">
            <span class="habit-name">${ctx.escapeHtml(habit.name)}</span>
            <span class="habit-progress">${ctx.escapeHtml(progressLabel(habit, total))}</span>
          </span>
        </button>
        <button type="button" class="habit-streak" data-open="${ctx.escapeHtml(habit.id)}">
          <span aria-hidden="true">🔥</span> ${streak} ${streak === 1 ? "día" : "días"}
        </button>
      </article>`;
    })
    .join("");
  const admin = ctx.app.account?.isAdmin && !seedAlreadyImported();
  const box = shell(
    ctx,
    `<header class="flex flex-col gap-1">
      <p class="text-sm font-medium text-sage">Hoy</p>
      <h1 class="display text-4xl leading-none">${ctx.escapeHtml(niceDate(today))}</h1>
    </header>
    <div class="week-strip">${strip}</div>
    <div class="flex flex-col gap-3">${cards || `<p class="text-muted">Todavía no hay hábitos. Crea el primero y tócalo para anotar.</p>`}</div>
    <button type="button" id="habit-new" class="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-gold font-semibold text-bg">${ctx.icon("plus")}Nuevo hábito</button>
    ${admin ? `<button type="button" id="habit-import" class="h-12 w-full rounded-full border border-line font-medium">Traer mi historial</button>` : ""}
    <p class="text-sm text-sage" id="habit-status">${ctx.escapeHtml(ctx.app.habitNotice || "")}</p>`
  );
  ctx.app.habitNotice = "";
  box.querySelector("#habit-new").onclick = () => openForm(ctx, null);
  const importBtn = box.querySelector("#habit-import");
  if (importBtn) {
    importBtn.onclick = () => {
      const result = importAdminSeedIfNeeded();
      ctx.app.habitNotice = result.already ? "Ese historial ya está en tu cuenta." : `Listo. Traje ${result.added} anotaciones.`;
      ctx.render();
    };
  }
  for (const button of box.querySelectorAll("[data-add]")) {
    button.onclick = () => quickAdd(ctx, button.dataset.add);
  }
  for (const button of box.querySelectorAll("[data-open]")) {
    button.onclick = (event) => {
      event.stopPropagation();
      openStats(ctx, button.dataset.open);
    };
  }
}

function parseWeekIndex(iso) {
  const date = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return (date.getDay() + 6) % 7;
}

function quickAdd(ctx, id) {
  const habit = habitById(id);
  if (!habit) return;
  const today = todayISO();
  if (habit.type === "check") {
    const total = dayTotal(habit.id, today, loadHabits().entries);
    if (dayDone(habit, total)) clearCheck(habit.id, today);
    else addEntry(habit.id, today, 1);
  } else if (habit.type === "minutes") {
    addEntry(habit.id, today, 5);
  } else {
    addEntry(habit.id, today, 1);
  }
  ctx.render();
}

function openStats(ctx, id) {
  ctx.app.habitId = id;
  ctx.app.screen = "stats";
  ctx.render();
}

function openForm(ctx, habit) {
  ctx.app.habitDraft = habit
    ? { id: habit.id, name: habit.name, type: habit.type, goal: habit.goal ?? "", emoji: habit.emoji, color: habit.color }
    : { id: null, name: "", type: "count", goal: "", emoji: "✨", color: HABIT_COLORS[loadHabits().habits.length % HABIT_COLORS.length] };
  ctx.app.screen = "habit-form";
  ctx.render();
}

function renderReports(ctx) {
  const kind = ctx.app.reportKind || "semana";
  const report = buildReport(kind);
  const tabs = [
    ["semana", "Semana"],
    ["mes", "Mes"],
    ["ano", "Año"],
  ]
    .map(
      ([id, label]) =>
        `<button type="button" class="h-11 flex-1 rounded-full border text-sm font-medium ${kind === id ? "border-gold bg-gold/10" : "border-line"}" data-kind="${id}">${label}</button>`
    )
    .join("");
  const head = report.dates
    .map((date) => {
      const mark = date === report.bestDay ? " is-best" : "";
      const label = kind === "ano" ? date.slice(5, 7) : String(Number(date.slice(8, 10)));
      return `<span class="grid-head${mark}">${label}</span>`;
    })
    .join("");
  const rows = report.rows
    .map((row) => {
      const dots = row.cells
        .map(
          (cell) =>
            `<i class="grid-dot tone-${row.habit.color} ${cell.ok ? "is-on" : ""}" title="${ctx.escapeHtml(cell.date)}"></i>`
        )
        .join("");
      return `<button type="button" class="report-row" data-open="${ctx.escapeHtml(row.habit.id)}">
        <span class="report-label"><span aria-hidden="true">${row.habit.emoji}</span> ${ctx.escapeHtml(row.habit.name)}</span>
        <span class="report-dots">${dots}</span>
      </button>`;
    })
    .join("");
  const bestRow = report.dates
    .map((date) => `<i class="grid-dot ${date === report.bestDay ? "is-best" : ""}"></i>`)
    .join("");
  const box = shell(
    ctx,
    `<header class="flex flex-col gap-1">
      <p class="text-sm font-medium text-sage">Informes</p>
      <h1 class="display text-4xl leading-none">${ctx.escapeHtml(report.label)}</h1>
      <p class="text-sm text-muted">La semana va de lunes a domingo.</p>
    </header>
    <div class="flex gap-2">${tabs}</div>
    <div class="report-scroll">
      <div class="report-grid" style="--cols:${report.dates.length}">
        <div class="report-row">
          <span class="report-label"></span>
          <span class="report-dots">${head}</span>
        </div>
        ${rows || `<p class="text-muted">Crea un hábito para ver el informe.</p>`}
        <div class="report-row">
          <span class="report-label">Mejor día</span>
          <span class="report-dots">${bestRow}</span>
        </div>
      </div>
    </div>
    <p class="text-sm text-muted">Mejor día: ${ctx.escapeHtml(shortDate(report.bestDay))}.</p>
    <div class="grid grid-cols-2 gap-3">
      ${statCard("Cumplido", `${report.pct}%`)}
      ${statCard("Mejor día", shortDate(report.bestDay))}
      ${statCard("Total hecho", String(report.done))}
      ${statCard("Mejor racha", `${report.bestRun} d`)}
    </div>`
  );
  for (const button of box.querySelectorAll("[data-kind]")) {
    button.onclick = () => {
      ctx.app.reportKind = button.dataset.kind;
      ctx.render();
    };
  }
  for (const button of box.querySelectorAll("[data-open]")) {
    button.onclick = () => openStats(ctx, button.dataset.open);
  }
}

function statCard(label, value) {
  return `<div class="card flex flex-col gap-1 p-4">
    <span class="text-xs tracking-wide text-muted uppercase">${label}</span>
    <span class="display text-4xl leading-none">${value}</span>
  </div>`;
}

function renderStats(ctx) {
  const store = loadHabits();
  const habit = habitById(ctx.app.habitId) || store.habits[0];
  if (!habit) {
    ctx.app.screen = "habits";
    ctx.render();
    return;
  }
  const now = new Date();
  const year = ctx.app.statYear || now.getFullYear();
  const month = ctx.app.statMonth == null ? now.getMonth() : ctx.app.statMonth;
  const cells = monthGrid(habit, year, month, store.entries);
  const heat = yearHeat(habit, year, store.entries);
  const monthDone = cells.filter((cell) => cell?.ok).length;
  const everDone = new Set(
    store.entries.filter((entry) => entry.habitId === habit.id && dayDone(habit, dayTotal(habit.id, entry.date, store.entries))).map((entry) => entry.date)
  ).size;
  const chips = store.habits
    .map(
      (item) =>
        `<button type="button" class="habit-chip tone-${item.color} ${item.id === habit.id ? "is-on" : ""}" data-habit="${ctx.escapeHtml(item.id)}">${item.emoji} ${ctx.escapeHtml(item.name)}</button>`
    )
    .join("");
  const calendar = cells
    .map((cell) => {
      if (!cell) return `<span class="cal-empty"></span>`;
      return `<div class="cal-day">${ring(cell.ratio, habit.color)}<span>${cell.day}</span></div>`;
    })
    .join("");
  const heatCells = heat
    .map((cell) => {
      if (!cell) return `<i class="heat-cell is-empty"></i>`;
      const level = cell.ratio <= 0 ? "0" : cell.ratio < 0.34 ? "1" : cell.ratio < 0.67 ? "2" : cell.ratio < 1 ? "3" : "4";
      return `<i class="heat-cell tone-${habit.color} lv-${level}" title="${ctx.escapeHtml(cell.date)}"></i>`;
    })
    .join("");
  const box = shell(
    ctx,
    `<header class="flex items-center justify-between gap-3">
      <div>
        <p class="text-sm font-medium text-sage">Estadísticas</p>
        <h1 class="display text-4xl leading-none">${ctx.escapeHtml(habit.name)}</h1>
      </div>
      <button type="button" id="stat-edit" class="text-sm font-medium text-sage">Ajustar</button>
    </header>
    <div class="chip-row">${chips}</div>
    <div class="flex items-center justify-between gap-3">
      <button type="button" id="month-prev" class="h-11 rounded-full border border-line px-4" aria-label="Mes anterior">‹</button>
      <p class="font-medium">${ctx.escapeHtml(MONTHS[month])} ${year}</p>
      <button type="button" id="month-next" class="h-11 rounded-full border border-line px-4" aria-label="Mes siguiente">›</button>
    </div>
    <div class="cal-week">${WEEKDAYS.map((letter) => `<span>${letter}</span>`).join("")}</div>
    <div class="cal-grid">${calendar}</div>
    <h2 class="display text-2xl">Año ${year}</h2>
    <div class="heat-scroll"><div class="heat-grid">${heatCells}</div></div>
    <div class="grid grid-cols-2 gap-3">
      ${statCard("Días del mes", String(monthDone))}
      ${statCard("Total de días", String(everDone))}
      ${statCard("Racha actual", `${currentStreak(habit, store.entries)} d`)}
      ${statCard("Mejor racha", `${bestStreak(habit, store.entries)} d`)}
    </div>`
  );
  box.querySelector("#stat-edit").onclick = () => {
    ctx.app.habitId = habit.id;
    ctx.app.entryEdit = null;
    ctx.app.screen = "habit";
    ctx.render();
  };
  for (const button of box.querySelectorAll("[data-habit]")) {
    button.onclick = () => openStats(ctx, button.dataset.habit);
  }
  const shift = (delta) => {
    const next = new Date(year, month + delta, 1);
    ctx.app.statYear = next.getFullYear();
    ctx.app.statMonth = next.getMonth();
    ctx.render();
  };
  box.querySelector("#month-prev").onclick = () => shift(-1);
  box.querySelector("#month-next").onclick = () => shift(1);
}

function renderDetail(ctx) {
  const habit = habitById(ctx.app.habitId);
  if (!habit) {
    ctx.app.screen = "habits";
    ctx.render();
    return;
  }
  const period = ctx.app.habitPeriod || "hoy";
  const summary = sumHabit(habit.id, period);
  const target = goalForPeriod(habit, summary.days);
  const store = loadHabits();
  const start = todayISO(summary.start);
  const end = todayISO(summary.end);
  const entries = store.entries
    .filter((entry) => entry.habitId === habit.id && entry.date >= start && entry.date <= end)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const periods = [
    ["hoy", "Hoy"],
    ["semana", "Semana"],
    ["mes", "Mes"],
    ["ano", "Año"],
  ]
    .map(
      ([id, label]) =>
        `<button type="button" class="h-11 flex-1 rounded-full border text-sm font-medium ${period === id ? "border-gold bg-gold/10" : "border-line"}" data-period="${id}">${label}</button>`
    )
    .join("");
  const dateValue = ctx.app.logDate && validDate(ctx.app.logDate) ? ctx.app.logDate : todayISO();
  const checked = habit.type === "check" && dayDone(habit, dayTotal(habit.id, dateValue, store.entries));
  const logBlock =
    habit.type === "check"
      ? `<button type="button" id="habit-check" class="h-14 w-full rounded-full font-semibold ${checked ? "border border-line" : "bg-sage text-bg"}">${checked ? "Quitar el hecho" : "Marcar hecho"}</button>`
      : `<label class="flex flex-col gap-1">
          <span class="text-xs tracking-wide text-muted uppercase">${habit.type === "minutes" ? "Minutos" : "Cantidad"}</span>
          <input id="habit-amount" class="auth-input rounded-xl border border-line bg-transparent px-3 text-fg outline-none" inputmode="decimal" type="number" min="0" step="1" value="1"/>
        </label>
        <button type="button" id="habit-add" class="h-14 w-full rounded-full bg-gold font-semibold text-bg">Anotar</button>`;
  const rows = entries
    .map(
      (entry) => `<div class="flex items-center justify-between gap-3 border-b border-line py-3">
        <div>
          <p class="font-medium">${ctx.escapeHtml(formatAmount(habit, entry.amount))}</p>
          <p class="text-sm text-muted">${ctx.escapeHtml(entry.date)}</p>
        </div>
        <button type="button" class="h-11 rounded-full border border-line px-3 text-sm" data-del="${ctx.escapeHtml(entry.id)}">Quitar</button>
      </div>`
    )
    .join("");
  const meta = target
    ? `${formatAmount(habit, summary.total)} de ${formatAmount(habit, target)} · ${trimNum(habit.goal)} × ${summary.days} días`
    : "Sin meta diaria";
  const box = shell(
    ctx,
    `<header class="flex flex-col gap-2">
      <p class="text-sm font-medium text-sage">${habit.emoji} ${ctx.escapeHtml(typeLabel(habit.type))}</p>
      <h1 class="display text-4xl leading-none">${ctx.escapeHtml(habit.name)}</h1>
    </header>
    <div class="flex gap-2">${periods}</div>
    <div class="card flex flex-col gap-2 p-5">
      <p class="display text-5xl leading-none">${ctx.escapeHtml(formatAmount(habit, summary.total))}</p>
      <p class="text-sm text-muted">${ctx.escapeHtml(meta)}</p>
    </div>
    <label class="flex flex-col gap-1">
      <span class="text-xs tracking-wide text-muted uppercase">Fecha</span>
      <input id="habit-date" class="auth-input rounded-xl border border-line bg-transparent px-3 text-fg outline-none" type="date" value="${dateValue}"/>
    </label>
    ${logBlock}
    <div><h2 class="display text-2xl">Anotaciones</h2>${rows || `<p class="text-muted mt-2">Nada en este periodo.</p>`}</div>
    <button type="button" id="habit-rename" class="h-12 w-full rounded-full border border-line font-medium">Editar hábito</button>
    <button type="button" id="habit-back" class="h-12 w-full rounded-full border border-line font-medium">Volver</button>`
  );
  box.querySelector("#habit-back").onclick = () => {
    ctx.app.screen = "stats";
    ctx.render();
  };
  box.querySelector("#habit-rename").onclick = () => openForm(ctx, habit);
  for (const button of box.querySelectorAll("[data-period]")) {
    button.onclick = () => {
      ctx.app.habitPeriod = button.dataset.period;
      ctx.render();
    };
  }
  const dateInput = box.querySelector("#habit-date");
  dateInput.onchange = () => {
    ctx.app.logDate = dateInput.value;
    if (habit.type === "check") ctx.render();
  };
  const checkBtn = box.querySelector("#habit-check");
  if (checkBtn) {
    checkBtn.onclick = () => {
      if (!validDate(dateInput.value)) return;
      if (checked) clearCheck(habit.id, dateInput.value);
      else addEntry(habit.id, dateInput.value, 1);
      ctx.app.logDate = dateInput.value;
      ctx.render();
    };
  }
  const addBtn = box.querySelector("#habit-add");
  if (addBtn) {
    addBtn.onclick = () => {
      if (!validDate(dateInput.value)) return;
      addEntry(habit.id, dateInput.value, box.querySelector("#habit-amount").value);
      ctx.app.logDate = dateInput.value;
      ctx.render();
    };
  }
  for (const button of box.querySelectorAll("[data-del]")) {
    button.onclick = () => {
      deleteEntry(button.dataset.del);
      ctx.render();
    };
  }
}

function renderForm(ctx) {
  const draft = ctx.app.habitDraft || { id: null, name: "", type: "count", goal: "", emoji: "✨", color: "mint" };
  const emojis = HABIT_EMOJIS.map(
    (emoji) =>
      `<button type="button" class="emoji-pick ${draft.emoji === emoji ? "is-on" : ""}" data-emoji="${emoji}" aria-label="Icono">${emoji}</button>`
  ).join("");
  const colors = HABIT_COLORS.map(
    (color) =>
      `<button type="button" class="color-pick tone-${color} ${draft.color === color ? "is-on" : ""}" data-color="${color}" aria-label="Color ${color}"></button>`
  ).join("");
  const types = [
    ["count", "Cantidad"],
    ["minutes", "Minutos"],
    ["check", "Sí o no"],
  ]
    .map(
      ([id, label]) =>
        `<button type="button" class="h-12 flex-1 rounded-full border text-sm font-medium ${draft.type === id ? "border-gold bg-gold/10" : "border-line"}" data-type="${id}">${label}</button>`
    )
    .join("");
  const box = shell(
    ctx,
    `<header class="flex flex-col gap-1">
      <p class="text-sm font-medium text-sage">Hábito</p>
      <h1 class="display text-4xl leading-none">${draft.id ? "Editar" : "Nuevo hábito"}</h1>
    </header>
    <form id="habit-form" class="flex flex-col gap-3">
      <div class="emoji-row">${emojis}</div>
      <div class="color-row">${colors}</div>
      <label class="flex flex-col gap-1">
        <span class="text-xs tracking-wide text-muted uppercase">Nombre</span>
        <input id="habit-name" class="auth-input rounded-xl border border-line bg-transparent px-3 text-fg outline-none" maxlength="60" required placeholder="Lectura"/>
      </label>
      <div class="flex gap-2">${types}</div>
      <label class="flex flex-col gap-1">
        <span class="text-xs tracking-wide text-muted uppercase">Meta diaria, opcional</span>
        <input id="habit-goal" class="auth-input rounded-xl border border-line bg-transparent px-3 text-fg outline-none" inputmode="decimal" type="number" min="0" step="1" placeholder="Sin meta"/>
      </label>
      <p class="text-sm text-muted" id="habit-form-status"></p>
      <button type="submit" class="h-14 w-full rounded-full bg-gold font-semibold text-bg">Guardar</button>
    </form>
    ${draft.id ? `<button type="button" id="habit-delete" class="h-12 w-full rounded-full border border-line font-medium">Eliminar hábito</button>` : ""}
    <button type="button" id="habit-cancel" class="h-12 w-full rounded-full border border-line font-medium">Volver</button>`
  );
  const nameInput = box.querySelector("#habit-name");
  nameInput.value = draft.name || "";
  const goalInput = box.querySelector("#habit-goal");
  goalInput.value = draft.goal ?? "";
  const remember = (patch) => {
    ctx.app.habitDraft = {
      ...draft,
      name: nameInput.value,
      goal: goalInput.value,
      ...patch,
    };
    ctx.render();
  };
  for (const button of box.querySelectorAll("[data-emoji]")) button.onclick = () => remember({ emoji: button.dataset.emoji });
  for (const button of box.querySelectorAll("[data-color]")) button.onclick = () => remember({ color: button.dataset.color });
  for (const button of box.querySelectorAll("[data-type]")) button.onclick = () => remember({ type: button.dataset.type });
  box.querySelector("#habit-form").onsubmit = (event) => {
    event.preventDefault();
    const payload = {
      name: nameInput.value,
      type: draft.type,
      goal: goalInput.value,
      emoji: draft.emoji || guessEmoji(nameInput.value),
      color: draft.color,
    };
    const saved = draft.id ? updateHabit(draft.id, payload) : createHabit(payload);
    if (!saved) {
      box.querySelector("#habit-form-status").textContent = "Escribe un nombre.";
      return;
    }
    ctx.app.habitId = saved.id;
    ctx.app.screen = "habits";
    ctx.render();
  };
  box.querySelector("#habit-cancel").onclick = () => {
    ctx.app.screen = "habits";
    ctx.render();
  };
  const remove = box.querySelector("#habit-delete");
  if (remove) {
    remove.onclick = () => {
      if (!confirm("¿Eliminar este hábito y sus anotaciones?")) return;
      deleteHabit(draft.id);
      ctx.app.screen = "habits";
      ctx.render();
    };
  }
}

async function renderGroup(ctx) {
  const store = loadHabits();
  const mine = shareCard(ctx.app.account?.name);
  const box = shell(
    ctx,
    `<header class="flex flex-col gap-1">
      <p class="text-sm font-medium text-sage">Grupo</p>
      <h1 class="display text-4xl leading-none">Juntos</h1>
      <p class="text-muted">Solo las personas que Ismael autorizó, y solo si cada quien elige compartir. Un toque de ánimo, nada más.</p>
    </header>
    <label class="card flex items-center justify-between gap-3 p-4">
      <span>
        <span class="block font-medium">Compartir mi día</span>
        <span class="block text-sm text-muted">Tu nombre, tus hábitos de hoy y tu racha. No tu historial completo.</span>
      </span>
      <input id="share-toggle" type="checkbox" class="size-5 accent-gold" ${store.share ? "checked" : ""}/>
    </label>
    <div id="group-list" class="flex flex-col gap-3"><p class="text-muted">Cargando…</p></div>`
  );
  box.querySelector("#share-toggle").onchange = (event) => {
    setShare(event.target.checked);
    ctx.render();
  };
  const list = box.querySelector("#group-list");
  if (!ctx.cloudOn) {
    list.innerHTML = previewCard(ctx, mine, true) + `<p class="text-muted">Cuando las cuentas de Google estén conectadas, aquí aparecen quienes también compartan.</p>`;
    return;
  }
  try {
    const people = await ctx.listGroup();
    const others = people.filter((person) => person.uid !== ctx.app.account?.uid);
    const self = people.find((person) => person.uid === ctx.app.account?.uid);
    list.innerHTML =
      (self ? personCard(ctx, self, true) : previewCard(ctx, mine, true)) +
      (others.length ? others.map((person) => personCard(ctx, person, false)).join("") : `<p class="text-muted">Nadie más ha activado compartir todavía.</p>`);
    for (const button of list.querySelectorAll("[data-cheer]")) {
      button.onclick = async () => {
        button.disabled = true;
        try {
          await ctx.cheer(button.dataset.uid, button.dataset.habit);
          button.textContent = "👍";
          button.classList.add("is-on");
        } catch {
          button.disabled = false;
        }
      };
    }
  } catch {
    list.innerHTML = `<p class="text-muted">No se pudo abrir el grupo. Revisa la conexión y que las reglas de Firestore estén publicadas.</p>`;
  }
}

function previewCard(ctx, card, self) {
  return personCard(ctx, { uid: "local", name: card.name, habits: card.habits, optedIn: card.optedIn }, self, true);
}

function personCard(ctx, person, self, localOnly) {
  const initial = ctx.escapeHtml((person.name || "?").slice(0, 1).toUpperCase());
  const habits = (person.habits || [])
    .map((habit) => {
      const cheer = self || localOnly
        ? ""
        : `<button type="button" class="cheer" data-cheer="1" data-uid="${ctx.escapeHtml(person.uid)}" data-habit="${ctx.escapeHtml(habit.id)}" aria-label="Enviar ánimo">👍</button>`;
      return `<div class="group-habit">
        <span class="habit-emoji" aria-hidden="true">${habit.emoji || "✨"}</span>
        <span class="group-habit-copy">
          <span class="flex items-center justify-between gap-2"><span>${ctx.escapeHtml(habit.name)}</span><span class="text-sm text-muted">${habit.pct || 0}%</span></span>
          <span class="habit-track"><span class="tone-${habit.color || "mint"}" style="width:${Math.max(0, Math.min(100, habit.pct || 0))}%"></span></span>
        </span>
        ${cheer}
      </div>`;
    })
    .join("");
  const note = person.optedIn || (person.habits || []).length ? "" : `<p class="text-sm text-muted">Activa compartir para salir en el grupo.</p>`;
  return `<section class="card flex flex-col gap-3 p-4">
    <div class="flex items-center gap-3">
      <span class="avatar" aria-hidden="true">${initial}</span>
      <div>
        <p class="font-medium">${ctx.escapeHtml(person.name || "Alguien")}${self ? " · tú" : ""}</p>
        <p class="text-sm text-muted">${self ? "Tu día" : "Hoy"}</p>
      </div>
    </div>
    ${habits || note}
  </section>`;
}
