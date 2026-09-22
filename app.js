const STORAGE_KEY = "na-library-routes";
const initialData = {
  routes: [{
    id: "phone_route",
    name: "Phone Route",
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
function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.routes)) return saved;
  } catch (_) {}
  return clone(initialData);
}
function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function integerValue(value) {
  return Math.trunc(numberValue(value));
}

function inputField(label, value, onChange, type = "number") {
  const wrapper = document.createElement("div");
  wrapper.className = "field";
  const labelElement = document.createElement("label");
  labelElement.textContent = label;
  const input = document.createElement("input");
  input.type = type;
  input.value = value ?? "";
  if (type === "number") input.step = "any";
  input.addEventListener("change", () => { onChange(type === "number" ? numberValue(input.value) : input.value); save(); });
  wrapper.append(labelElement, input);
  return wrapper;
}

function checkboxField(label, value, onChange) {
  const wrapper = document.createElement("label");
  wrapper.className = "checkbox";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(value);
  input.addEventListener("change", () => { onChange(input.checked); save(); });
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
  const top = document.createElement("div");
  top.className = "command-top";
  const title = document.createElement("span");
  title.className = "command-title";
  title.textContent = `${index + 1}. ${commandLabels[command.type]}`;
  const remove = document.createElement("button");
  remove.className = "icon-button";
  remove.type = "button";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => { route.commands.splice(index, 1); save(); render(); });
  top.append(title, remove);
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
  id.textContent = `id: ${route.id || "route"}`;
  titleBlock.append(title, id);
  const remove = document.createElement("button");
  remove.className = "icon-button";
  remove.type = "button";
  remove.textContent = "Delete route";
  remove.addEventListener("click", () => { if (data.routes.length === 1 || confirm("Delete this route?")) { data.routes.splice(routeIndex, 1); save(); render(); } });
  heading.append(titleBlock, remove);
  card.append(heading);
  const fields = document.createElement("div");
  fields.className = "field-grid";
  fields.append(inputField("Route name", route.name, (value) => { route.name = value; render(); }, "text"));
  fields.append(inputField("Route ID", route.id, (value) => { route.id = slug(value); render(); }, "text"));
  card.append(fields);
  const commands = document.createElement("div");
  commands.className = "commands";
  route.commands.forEach((command, index) => commands.append(renderCommand(command, route, index)));
  const add = document.createElement("button");
  add.className = "button add-command";
  add.type = "button";
  add.textContent = "＋ Add command";
  add.addEventListener("click", () => {
    const picker = document.createElement("div");
    picker.className = "field-grid command-fields";
    const select = document.createElement("select");
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
      route.commands.push(defaultCommand(select.value));
      save();
      render();
    });
    const cancel = document.createElement("button");
    cancel.className = "button button-secondary";
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => picker.remove());
    picker.append(select, document.createElement("span"));
    picker.append(confirm, cancel);
    add.replaceWith(picker);
  });
  commands.append(add);
  card.append(commands);
  return card;
}

function render() {
  routeList.replaceChildren();
  if (!data.routes.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No routes yet. Create one to begin.";
    routeList.append(empty);
  } else data.routes.forEach((route, index) => routeList.append(renderRoute(route, index)));
}

document.querySelector("#add-route-button").addEventListener("click", () => {
  const id = `route_${data.routes.length + 1}`;
  data.routes.push({ id, name: `Route ${data.routes.length + 1}`, commands: [] });
  save(); render(); setStatus("New route added.");
});
document.querySelector("#reset-button").addEventListener("click", () => {
  if (confirm("Reset the editor to the sample route?")) { data = clone(initialData); save(); render(); setStatus("Editor reset."); }
});
document.querySelector("#export-button").addEventListener("click", () => {
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
    data = imported; save(); render(); setStatus("Routes imported.");
  } catch (error) {
    setStatus(`Import failed: ${error.message}`, true);
  }
  event.target.value = "";
});

render();
