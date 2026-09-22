// Updated 2026-09-22: refresh GitHub Pages deployment, batch 2.
const STORAGE_KEY = "na-library-routes";
const PREVIEW_STARTS_KEY = "na-library-preview-starts";
const FIELD_SIZE_MM = 3560;
const FIELD_VIEW_SIZE = 320;
let fieldId = 0;
let previewStarts = loadPreviewStarts();
let draggingStart = null;
let draggedCommand = null;
const undoStack = [];
const redoStack = [];
const initialData = {
  routes: [{
    id: "phone_route",
    name: "Phone Route",
    start: { x: 0, y: -1780, heading: 0 },
    commands: [
      { type: "turn", heading: 352.5, speed: 100 },
      { type: "drive", distance: 765, rpm: 250, inDrive: true }
    ]
  }]
};

const commandLabels = {
  turn: "Turn to heading",
  drive: "Drive",
  score_top: "Top score blocks",
  score_mid: "Mid score blocks",
  match_load: "Match load blocks",
  lift_unloader: "Lift unloader",
  drop_unloader: "Drop unloader",
  descore: "Descore"
};

let data = loadData();
const routeList = document.querySelector("#route-list");
const status = document.querySelector("#status");
const routeSummary = document.querySelector("#route-summary");
const previewSummary = document.querySelector("#preview-summary");
const fieldPreview = document.querySelector("#field-preview");
let selectedRouteId = null;

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function slug(value) {
  const result = value.toLowerCase().trim().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return result || "route";
}
function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
function updateHistoryButtons() {
  document.querySelector("#undo-button").disabled = undoStack.length === 0;
  document.querySelector("#redo-button").disabled = redoStack.length === 0;
}
function checkpoint() {
  undoStack.push(clone(data));
  if (undoStack.length > 50) undoStack.shift();
  redoStack.length = 0;
  updateHistoryButtons();
}
function restoreState(state) {
  data = clone(state);
  save();
  render();
}
function uniqueRouteId(baseId) {
  const root = slug(baseId) || "route";
  let candidate = `${root}_copy`;
  let suffix = 2;
  while (data.routes.some((route) => route.id === candidate)) candidate = `${root}_copy_${suffix++}`;
  return candidate;
}
function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.routes)) return saved;
  } catch (_) {}
  return clone(initialData);
}
function loadPreviewStarts() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREVIEW_STARTS_KEY));
    if (saved && typeof saved === "object") return saved;
  } catch (_) {}
  return {};
}
function savePreviewStarts() {
  localStorage.setItem(PREVIEW_STARTS_KEY, JSON.stringify(previewStarts));
}
function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function integerValue(value) {
  return Math.trunc(numberValue(value));
}

function validationErrors(route, routeIds = []) {
  const errors = [];
  const routeId = typeof route.id === "string" ? route.id.trim() : "";
  if (!routeId) errors.push("Route ID is required.");
  if (routeId && routeIds.filter((id) => id === routeId).length > 1) errors.push("Route ID must be unique.");
  if (typeof route.name !== "string" || !route.name.trim()) errors.push("Route name is required.");
  if (!Array.isArray(route.commands)) errors.push("Commands must be an array.");
  (route.commands || []).forEach((command, index) => {
    const label = `Command ${index + 1}`;
    if (!command || !commandLabels[command.type]) { errors.push(`${label}: unknown command type.`); return; }
    const requireNumber = (key, description, minimum = -Infinity) => {
      if (!Number.isFinite(Number(command[key])) || Number(command[key]) < minimum) errors.push(`${label}: ${description} is invalid.`);
    };
    if (command.type === "turn") {
      requireNumber("heading", "heading", 0);
      if (Number(command.heading) >= 360) errors.push(`${label}: heading must be below 360 degrees.`);
      requireNumber("speed", "speed", 0);
      if (Number(command.speed) > 100) errors.push(`${label}: speed cannot exceed 100%.`);
    } else if (command.type === "drive") {
      requireNumber("distance", "distance");
      requireNumber("rpm", "RPM", 1);
    } else if (command.type === "score_top" || command.type === "score_mid") {
      requireNumber("blocks", "block count", 1);
      requireNumber("timeoutMs", "timeout", 0);
      if (!Number.isInteger(Number(command.blocks))) errors.push(`${label}: block count must be a whole number.`);
    } else if (command.type === "match_load") {
      requireNumber("distance", "distance");
      requireNumber("backUpDistance", "back-up distance", 0);
      requireNumber("timeoutMs", "timeout", 0);
      requireNumber("blocks", "block count", 1);
      if (!Number.isInteger(Number(command.blocks))) errors.push(`${label}: block count must be a whole number.`);
    } else if (command.type === "descore") {
      requireNumber("distance", "distance", 0);
      requireNumber("rpm", "RPM", 1);
    }
  });
  return errors;
}

function allValidationErrors() {
  const routeIds = data.routes.map((route) => typeof route.id === "string" ? route.id.trim() : "");
  return data.routes.flatMap((route, index) => validationErrors(route, routeIds).map((error) => `Route ${index + 1}: ${error}`));
}

function showValidationErrors(errors) {
  setStatus(`${errors.length} issue${errors.length === 1 ? "" : "s"} must be fixed before exporting.`, true);
  document.querySelector(".validation-error")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function inputField(label, value, onChange, type = "number") {
  const wrapper = document.createElement("div");
  wrapper.className = "field";
  const labelElement = document.createElement("label");
  labelElement.textContent = label;
  const input = document.createElement("input");
  input.id = `field-${fieldId++}`;
  labelElement.htmlFor = input.id;
  input.type = type;
  input.value = value ?? "";
  if (type === "number") input.step = "any";
  input.addEventListener("change", () => { checkpoint(); onChange(type === "number" ? numberValue(input.value) : input.value); save(); });
  wrapper.append(labelElement, input);
  return wrapper;
}

function checkboxField(label, value, onChange) {
  const wrapper = document.createElement("label");
  wrapper.className = "checkbox";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(value);
  input.addEventListener("change", () => { checkpoint(); onChange(input.checked); save(); });
  wrapper.append(input, document.createTextNode(label));
  return wrapper;
}

function commandFields(command, route) {
  const fields = document.createElement("div");
  fields.className = "field-grid command-fields";
  const update = (key) => (value) => { command[key] = value; render(); };
  if (command.type === "turn") {
    fields.append(inputField("Heading (degrees)", command.heading, update("heading")), inputField("Speed (%)", command.speed, update("speed")));
  } else if (command.type === "drive") {
    fields.append(inputField("Distance (mm)", command.distance, update("distance")), inputField("RPM", command.rpm, update("rpm")));
    fields.append(checkboxField("Use intake drive", command.inDrive, update("inDrive")));
    if (command.inDrive) fields.append(checkboxField("Drop load", command.dropLoad, update("dropLoad")));
    else fields.append(checkboxField("Stop at end", command.stopAtEnd !== false, update("stopAtEnd")));
  } else if (command.type === "score_top" || command.type === "score_mid") {
    fields.append(inputField("Blocks", command.blocks, update("blocks")), inputField("Timeout (ms)", command.timeoutMs, update("timeoutMs")));
  } else if (command.type === "match_load") {
    fields.append(inputField("Distance (mm)", command.distance, update("distance")), inputField("Back-up (mm)", command.backUpDistance, update("backUpDistance")));
    fields.append(inputField("Timeout (ms)", command.timeoutMs, update("timeoutMs")), inputField("Blocks", command.blocks, update("blocks")));
  } else if (command.type === "descore") {
    fields.append(inputField("Distance (mm)", command.distance, update("distance")), inputField("RPM", command.rpm, update("rpm")));
  }
  return fields;
}

function defaultCommand(type) {
  const defaults = {
    turn: { type, heading: 0, speed: 100 },
    drive: { type, distance: 0, rpm: 300, inDrive: false, stopAtEnd: true },
    score_top: { type, blocks: 1, timeoutMs: 1000 },
    score_mid: { type, blocks: 1, timeoutMs: 1000 },
    match_load: { type, distance: 0, backUpDistance: 0, timeoutMs: 0, blocks: 1 },
    lift_unloader: { type },
    drop_unloader: { type },
    descore: { type, distance: 0, rpm: 300 }
  };
  return defaults[type];
}

function renderCommand(command, route, index) {
  const item = document.createElement("article");
  item.className = "command";
  item.draggable = window.matchMedia("(pointer: fine)").matches;
  item.addEventListener("dragstart", () => { draggedCommand = { route, index }; item.classList.add("dragging"); });
  item.addEventListener("dragend", () => { draggedCommand = null; item.classList.remove("dragging"); });
  item.addEventListener("dragover", (event) => { if (draggedCommand && draggedCommand.route === route) { event.preventDefault(); item.classList.add("drag-over"); } });
  item.addEventListener("dragleave", () => item.classList.remove("drag-over"));
  item.addEventListener("drop", (event) => {
    event.preventDefault();
    item.classList.remove("drag-over");
    if (!draggedCommand || draggedCommand.route !== route || draggedCommand.index === index) return;
    checkpoint();
    const [moved] = route.commands.splice(draggedCommand.index, 1);
    route.commands.splice(index, 0, moved);
    draggedCommand = null;
    save();
    render();
    setStatus("Command order updated.");
  });
  const top = document.createElement("div");
  top.className = "command-top";
  const title = document.createElement("span");
  title.className = "command-title";
  title.textContent = `${index + 1}. ${commandLabels[command.type]}`;
  const actions = document.createElement("div");
  actions.className = "command-actions";
  const move = (offset, label) => {
    const target = index + offset;
    if (target < 0 || target >= route.commands.length) return;
    [route.commands[index], route.commands[target]] = [route.commands[target], route.commands[index]];
    checkpoint();
    save(); render(); setStatus(`Moved command ${index + 1} ${label}.`);
  };
  const up = document.createElement("button");
  up.className = "reorder-button";
  up.type = "button";
  up.textContent = "↑";
  up.title = "Move command up";
  up.setAttribute("aria-label", "Move command up");
  up.disabled = index === 0;
  up.addEventListener("click", () => move(-1, "up"));
  const down = document.createElement("button");
  down.className = "reorder-button";
  down.type = "button";
  down.textContent = "↓";
  down.title = "Move command down";
  down.setAttribute("aria-label", "Move command down");
  down.disabled = index === route.commands.length - 1;
  down.addEventListener("click", () => move(1, "down"));
  const duplicate = document.createElement("button");
  duplicate.className = "text-button";
  duplicate.type = "button";
  duplicate.textContent = "Duplicate";
  duplicate.addEventListener("click", () => { checkpoint(); route.commands.splice(index + 1, 0, clone(command)); save(); render(); setStatus("Command duplicated."); });
  const remove = document.createElement("button");
  remove.className = "text-button danger-button";
  remove.type = "button";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => { checkpoint(); route.commands.splice(index, 1); save(); render(); });
  actions.append(up, down, duplicate, remove);
  top.append(title, actions);
  item.append(top);
  if (command.type !== "lift_unloader" && command.type !== "drop_unloader") item.append(commandFields(command, route));
  return item;
}

function renderRoute(route, routeIndex) {
  const card = document.createElement("article");
  card.className = "route-card";
  const heading = document.createElement("div");
  heading.className = "route-heading";
  const titleBlock = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = route.name || "Unnamed route";
  const id = document.createElement("p");
  const commandCount = Array.isArray(route.commands) ? route.commands.length : 0;
  id.textContent = `ID: ${route.id || "route"} · ${commandCount} ${commandCount === 1 ? "command" : "commands"}`;
  titleBlock.append(title, id);
  const routeActions = document.createElement("div");
  routeActions.className = "route-actions";
  const moveRoute = (offset, label) => {
    const target = routeIndex + offset;
    if (target < 0 || target >= data.routes.length) return;
    [data.routes[routeIndex], data.routes[target]] = [data.routes[target], data.routes[routeIndex]];
    checkpoint();
    save(); render(); setStatus(`Moved route ${label}.`);
  };
  const routeUp = document.createElement("button");
  routeUp.className = "reorder-button";
  routeUp.type = "button";
  routeUp.textContent = "↑";
  routeUp.title = "Move route up";
  routeUp.setAttribute("aria-label", "Move route up");
  routeUp.disabled = routeIndex === 0;
  routeUp.addEventListener("click", () => moveRoute(-1, "up"));
  const routeDown = document.createElement("button");
  routeDown.className = "reorder-button";
  routeDown.type = "button";
  routeDown.textContent = "↓";
  routeDown.title = "Move route down";
  routeDown.setAttribute("aria-label", "Move route down");
  routeDown.disabled = routeIndex === data.routes.length - 1;
  routeDown.addEventListener("click", () => moveRoute(1, "down"));
  const selectRoute = document.createElement("button");
  selectRoute.className = "text-button preview-button";
  selectRoute.type = "button";
  selectRoute.textContent = selectedRouteId === route.id ? "Previewing" : "Preview";
  selectRoute.addEventListener("click", () => { selectedRouteId = route.id; render(); });
  const duplicateRoute = document.createElement("button");
  duplicateRoute.className = "text-button";
  duplicateRoute.type = "button";
  duplicateRoute.textContent = "Duplicate";
  duplicateRoute.addEventListener("click", () => {
    checkpoint();
    const copy = clone(route);
    copy.id = uniqueRouteId(route.id || route.name || "route");
    copy.name = `${route.name || "Unnamed route"} Copy`;
    data.routes.splice(routeIndex + 1, 0, copy);
    selectedRouteId = copy.id;
    save();
    render();
    setStatus("Route duplicated.");
  });
  const remove = document.createElement("button");
  remove.className = "text-button danger-button";
  remove.type = "button";
  remove.textContent = "Delete";
  remove.addEventListener("click", () => { if (data.routes.length === 1 || confirm("Delete this route?")) { checkpoint(); data.routes.splice(routeIndex, 1); if (selectedRouteId === route.id) selectedRouteId = null; save(); render(); } });
  routeActions.append(routeUp, routeDown, selectRoute, duplicateRoute, remove);
  heading.append(titleBlock, routeActions);
  card.append(heading);
  const fields = document.createElement("div");
  fields.className = "field-grid";
  fields.append(inputField("Route name", route.name, (value) => { route.name = value; render(); }, "text"));
  fields.append(inputField("Route ID", route.id, (value) => { route.id = value.trim() ? slug(value) : ""; render(); }, "text"));
  card.append(fields);
  const errors = validationErrors(route, data.routes.map((item) => typeof item.id === "string" ? item.id.trim() : ""));
  if (errors.length) {
    const errorList = document.createElement("div");
    errorList.className = "validation-error";
    errorList.textContent = errors.join(" ");
    card.append(errorList);
  }
  const commands = document.createElement("div");
  commands.className = "commands";
  (route.commands || []).forEach((command, index) => commands.append(renderCommand(command, route, index)));
  const add = document.createElement("button");
  add.className = "button add-command";
  add.type = "button";
  add.textContent = "＋ Add command";
  add.addEventListener("click", () => {
    const picker = document.createElement("div");
    picker.className = "command-picker";
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Command type");
    Object.entries(commandLabels).forEach(([type, label]) => {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = label;
      select.append(option);
    });
    const confirm = document.createElement("button");
    confirm.className = "button button-primary";
    confirm.type = "button";
    confirm.textContent = "Add";
    confirm.addEventListener("click", () => {
      checkpoint();
      route.commands.push(defaultCommand(select.value));
      save();
      render();
    });
    const cancel = document.createElement("button");
    cancel.className = "button button-secondary";
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => picker.remove());
    const pickerActions = document.createElement("div");
    pickerActions.className = "picker-actions";
    pickerActions.append(confirm, cancel);
    picker.append(select, pickerActions);
    add.replaceWith(picker);
  });
  commands.append(add);
  card.append(commands);
  return card;
}

function render() {
  const routeCount = data.routes.length;
  routeSummary.textContent = `${routeCount} ${routeCount === 1 ? "route" : "routes"}`;
  routeList.replaceChildren();
  if (!data.routes.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No routes yet. Create one to begin.";
    routeList.append(empty);
  } else data.routes.forEach((route, index) => routeList.append(renderRoute(route, index)));
  renderPreview();
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function fieldPoint(x, y) {
  return {
    x: ((x + FIELD_SIZE_MM / 2) / FIELD_SIZE_MM) * FIELD_VIEW_SIZE,
    y: ((FIELD_SIZE_MM / 2 - y) / FIELD_SIZE_MM) * FIELD_VIEW_SIZE
  };
}

function previewStart(route) {
  if (route.start && Number.isFinite(Number(route.start.x)) && Number.isFinite(Number(route.start.y))) {
    return {
      x: Number(route.start.x),
      y: Number(route.start.y),
      heading: Number.isFinite(Number(route.start.heading)) ? Number(route.start.heading) : 0
    };
  }
  const saved = previewStarts[route.id];
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    return { x: saved.x, y: saved.y, heading: Number.isFinite(saved.heading) ? saved.heading : 0 };
  }
  return { x: 0, y: -FIELD_SIZE_MM / 2, heading: 0 };
}

function pointerToField(event) {
  const bounds = fieldPreview.getBoundingClientRect();
  const svgX = ((event.clientX - bounds.left) / bounds.width) * FIELD_VIEW_SIZE;
  const svgY = ((event.clientY - bounds.top) / bounds.height) * FIELD_VIEW_SIZE;
  return {
    x: Math.max(-FIELD_SIZE_MM / 2, Math.min(FIELD_SIZE_MM / 2, svgX / FIELD_VIEW_SIZE * FIELD_SIZE_MM - FIELD_SIZE_MM / 2)),
    y: Math.max(-FIELD_SIZE_MM / 2, Math.min(FIELD_SIZE_MM / 2, FIELD_SIZE_MM / 2 - svgY / FIELD_VIEW_SIZE * FIELD_SIZE_MM))
  };
}

function renderPreview() {
  fieldPreview.replaceChildren();
  const route = data.routes.find((item) => item.id === selectedRouteId) || data.routes[0];
  if (!route) { previewSummary.textContent = "Create a route to preview it."; return; }
  selectedRouteId = route.id;
  const commands = Array.isArray(route.commands) ? route.commands : [];
  const start = previewStart(route);
  previewSummary.textContent = `${route.name || "Unnamed route"} · ${commands.length} commands · start ${start.heading.toFixed(0)}° · 1 px = ${(FIELD_SIZE_MM / FIELD_VIEW_SIZE).toFixed(1)} mm`;
  let x = start.x;
  let y = start.y;
  let heading = start.heading;
  const points = [fieldPoint(x, y)];
  const addMovement = (distance) => {
    const radians = heading * Math.PI / 180;
    x += Math.sin(radians) * distance;
    y += Math.cos(radians) * distance;
    points.push(fieldPoint(x, y));
  };
  commands.forEach((command) => {
    if (command.type === "turn") heading = Number(command.heading) || 0;
    if (command.type === "drive" || command.type === "match_load" || command.type === "descore") {
      const distance = Number(command.distance) || 0;
      addMovement(distance);
      const currentPoint = points[points.length - 1];
      if (command.type === "drive" && command.inDrive) fieldPreview.append(svgElement("circle", { cx: currentPoint.x, cy: currentPoint.y, r: 6, class: "preview-intake" }));
      if (command.type === "match_load" && Number(command.backUpDistance)) addMovement(-Number(command.backUpDistance));
    }
    if (["score_top", "score_mid", "descore"].includes(command.type)) {
      const currentPoint = points[points.length - 1];
      fieldPreview.append(svgElement("circle", { cx: currentPoint.x, cy: currentPoint.y, r: 7, class: "preview-score" }));
    }
  });
  const path = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  fieldPreview.append(svgElement("path", { d: path, class: "preview-path" }));
  const directionRadians = start.heading * Math.PI / 180;
  const directionEnd = {
    x: Math.max(10, Math.min(FIELD_VIEW_SIZE - 10, points[0].x + Math.sin(directionRadians) * 30)),
    y: Math.max(10, Math.min(FIELD_VIEW_SIZE - 10, points[0].y - Math.cos(directionRadians) * 30))
  };
  fieldPreview.append(svgElement("line", { x1: points[0].x, y1: points[0].y, x2: directionEnd.x, y2: directionEnd.y, class: "preview-direction" }));
  fieldPreview.append(svgElement("circle", { cx: directionEnd.x, cy: directionEnd.y, r: 6, class: "preview-heading-handle", "data-heading-handle": "true" }));
  const markerY = Math.max(7, Math.min(FIELD_VIEW_SIZE - 7, points[0].y));
  fieldPreview.append(svgElement("circle", { cx: points[0].x, cy: markerY, r: 7, class: "preview-start", "data-start-marker": "true" }));
  const northLabel = svgElement("text", { x: 12, y: 24, class: "field-label" });
  northLabel.textContent = "N";
  fieldPreview.append(northLabel);
}

fieldPreview.addEventListener("pointerdown", (event) => {
  const target = event.target;
  const dragType = target.getAttribute("data-heading-handle") === "true" ? "heading" : target.getAttribute("data-start-marker") === "true" ? "position" : null;
  if (!dragType) return;
  checkpoint();
  draggingStart = { routeId: selectedRouteId, type: dragType };
  fieldPreview.setPointerCapture(event.pointerId);
  event.preventDefault();
});
fieldPreview.addEventListener("pointermove", (event) => {
  if (!draggingStart) return;
  const routeStart = previewStart(data.routes.find((route) => route.id === draggingStart.routeId));
  const pointer = pointerToField(event);
  if (draggingStart.type === "position") {
    const route = data.routes.find((item) => item.id === draggingStart.routeId);
    route.start = { ...routeStart, x: pointer.x, y: pointer.y };
  } else {
    const radians = Math.atan2(pointer.x - routeStart.x, pointer.y - routeStart.y);
    const heading = (radians * 180 / Math.PI + 360) % 360;
    const route = data.routes.find((item) => item.id === draggingStart.routeId);
    route.start = { ...routeStart, heading };
  }
  save();
  savePreviewStarts();
  renderPreview();
});
fieldPreview.addEventListener("pointerup", (event) => {
  if (!draggingStart) return;
  const dragType = draggingStart.type;
  draggingStart = null;
  fieldPreview.releasePointerCapture(event.pointerId);
  setStatus(dragType === "heading" ? "Preview start direction saved." : "Preview start position saved.");
});

document.querySelector("#add-route-button").addEventListener("click", () => {
  checkpoint();
  const id = `route_${data.routes.length + 1}`;
  data.routes.push({ id, name: `Route ${data.routes.length + 1}`, commands: [] });
  save(); render(); setStatus("New route added.");
});
document.querySelector("#reset-button").addEventListener("click", () => {
  if (confirm("Reset the editor to the sample route?")) {
    checkpoint();
    data = clone(initialData);
    previewStarts = {};
    save();
    savePreviewStarts();
    render();
    setStatus("Editor reset.");
  }
});
document.querySelector("#export-button").addEventListener("click", () => {
  const errors = allValidationErrors();
  if (errors.length) { showValidationErrors(errors); return; }
  const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "routes.json";
  link.click();
  URL.revokeObjectURL(link.href);
  setStatus("routes.json downloaded.");
});
document.querySelector("#import-input").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!imported || !Array.isArray(imported.routes)) throw new Error("Top-level routes must be an array.");
    checkpoint();
    data = imported; save(); render(); setStatus("Routes imported.");
    const errors = allValidationErrors();
    if (errors.length) setStatus(`Imported with ${errors.length} validation issue${errors.length === 1 ? "" : "s"}.`, true);
  } catch (error) {
    setStatus(`Import failed: ${error.message}`, true);
  }
  event.target.value = "";
});

document.querySelector("#undo-button").addEventListener("click", () => {
  if (!undoStack.length) return;
  redoStack.push(clone(data));
  restoreState(undoStack.pop());
  updateHistoryButtons();
  setStatus("Undid the last change.");
});
document.querySelector("#redo-button").addEventListener("click", () => {
  if (!redoStack.length) return;
  undoStack.push(clone(data));
  restoreState(redoStack.pop());
  updateHistoryButtons();
  setStatus("Redid the change.");
});

render();
updateHistoryButtons();
