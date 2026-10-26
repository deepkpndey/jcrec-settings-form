"use strict";
// Settings form for the jcrec-alerts Telegram bot. It runs inside Telegram as a Mini App.
// Saving hands the answers to Telegram with WebApp.sendData, which delivers them to the bot
// as a message; this page never sends data to any server. The last saved answers are kept in
// Telegram's per-user CloudStorage so the form opens prefilled. All values are written into the
// page with textContent or form values, never as HTML.
(function () {
  const tg = window.Telegram && window.Telegram.WebApp;
  // Telegram's script reports platform "unknown" outside Telegram. initData can't be used to tell:
  // it stays empty when the form opens from a chat keyboard button, which is how the bot opens it.
  const inTelegram = Boolean(tg && tg.platform && tg.platform !== "unknown");
  const STORAGE_WAIT_MS = 1500; // carry on without CloudStorage if it doesn't answer
  const STORAGE_KEY = "settings_v1";
  const MAX_KIDS = 6;
  const MAX_BYTES = 4096; // the most sendData can carry
  // Categories on jcrec.recdesk.com on 2026-10-25 (the site spells it "Pickelball").
  const CATEGORIES = ["Adaptive Recreation", "Adult", "Basketball", "Boxing", "Cheerleading", "Chilltown Social",
    "Cricket", "Dance", "Flag Football", "Football", "Martial Arts", "Pickelball", "Rugby", "Soccer", "Swim",
    "Track and Field"];
  const TIMES = [["", "No weekday programs"], ["15:00", "3:00 PM"], ["15:30", "3:30 PM"], ["16:00", "4:00 PM"],
    ["16:30", "4:30 PM"], ["17:00", "5:00 PM"], ["17:30", "5:30 PM"], ["18:00", "6:00 PM"], ["18:30", "6:30 PM"],
    ["19:00", "7:00 PM"]];
  const LEVELS = [["", "Any level"], ["1", "LTS 1"], ["2", "LTS 2"], ["3", "LTS 3"], ["4", "LTS 4"],
    ["5", "LTS 5"], ["6", "LTS 6"]];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
    "October", "November", "December"];

  const kidsEl = document.getElementById("kids");
  const errorEl = document.getElementById("error");
  let counter = 0;

  function el(tag, attrs, text) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? "" : String(v));
    });
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function select(id, options, value) {
    const s = el("select", { id: id });
    options.forEach(([v, label]) => {
      const o = el("option", { value: v }, label);
      if (String(value === undefined || value === null ? "" : value) === v) o.selected = true;
      s.appendChild(o);
    });
    return s;
  }

  function labelled(text, control) {
    const wrap = el("div", { class: "field" });
    wrap.appendChild(el("label", { for: control.id }, text));
    wrap.appendChild(control);
    return wrap;
  }

  function addKid(data) {
    data = data || { weekday_earliest: "18:00", weekends: true };
    const n = ++counter;
    const card = el("section", { class: "kid" });
    const name = el("input", { id: `name${n}`, type: "text", maxlength: 30, autocomplete: "off", value: data.name || "" });
    card.appendChild(labelled("First name or nickname", name));

    const useBirth = Boolean(data.birth_month);
    const ageMode = el("div", { class: "choice", role: "radiogroup", "aria-label": "Age or birth month" });
    const rAge = el("input", { type: "radio", name: `mode${n}`, id: `modeAge${n}`, value: "age", checked: !useBirth });
    const rBirth = el("input", { type: "radio", name: `mode${n}`, id: `modeBirth${n}`, value: "birth", checked: useBirth });
    ageMode.append(rAge, el("label", { for: rAge.id }, "Age"), rBirth, el("label", { for: rBirth.id }, "Birth month"));
    card.appendChild(ageMode);

    const age = el("input", { id: `age${n}`, type: "number", min: 0, max: 18, inputmode: "numeric",
      value: data.age === undefined ? "" : data.age });
    const ageField = labelled("Age today", age);
    const [by, bm] = (data.birth_month || "").split("-");
    const thisYear = new Date().getFullYear();
    const years = [["", "Year"]];
    for (let y = thisYear; y >= thisYear - 18; y--) years.push([String(y), String(y)]);
    const year = select(`year${n}`, years, by || "");
    const month = select(`month${n}`, [["", "Month"]].concat(MONTHS.map((m, i) => [String(i + 1).padStart(2, "0"), m])), bm || "");
    const birthField = el("div", { class: "field" });
    birthField.appendChild(el("label", { for: year.id }, "Birth month"));
    const row = el("div", { class: "row" });
    row.append(month, year);
    birthField.appendChild(row);
    card.append(ageField, birthField);
    const syncMode = () => { ageField.hidden = rBirth.checked; birthField.hidden = !rBirth.checked; };
    rAge.addEventListener("change", syncMode);
    rBirth.addEventListener("change", syncMode);
    syncMode();

    card.appendChild(labelled("Weekday programs starting at or after",
      select(`time${n}`, TIMES, data.weekday_earliest === undefined ? "18:00" : data.weekday_earliest)));
    const weekends = el("input", { type: "checkbox", id: `weekends${n}`, checked: data.weekends !== false });
    const wkWrap = el("div", { class: "check" });
    wkWrap.append(weekends, el("label", { for: weekends.id }, "Weekends at any time"));
    card.appendChild(wkWrap);
    card.appendChild(labelled("Swim classes", select(`swim${n}`, LEVELS, data.swim_level)));

    const skip = new Set(data.exclude_categories || ["Adaptive Recreation"]);
    const details = el("details");
    details.appendChild(el("summary", {}, "Skip these categories"));
    CATEGORIES.concat([...skip].filter((c) => !CATEGORIES.includes(c))).forEach((cat, i) => {
      const box = el("input", { type: "checkbox", id: `cat${n}_${i}`, value: cat, checked: skip.has(cat) });
      const line = el("div", { class: "check" });
      line.append(box, el("label", { for: box.id }, cat));
      details.appendChild(line);
    });
    card.appendChild(details);

    const remove = el("button", { type: "button", class: "remove" }, "Remove this kid");
    remove.addEventListener("click", () => { card.remove(); refresh(); });
    card.appendChild(remove);
    card.dataset.n = String(n);
    kidsEl.appendChild(card);
    refresh();
  }

  function refresh() {
    document.getElementById("add").hidden = kidsEl.children.length >= MAX_KIDS;
  }

  function readKid(card) {
    const n = card.dataset.n;
    const get = (id) => document.getElementById(id + n);
    const kid = { name: get("name").value.trim() };
    if (!kid.name) throw new Error("Every kid needs a name.");
    if (get("modeBirth").checked) {
      const y = get("year").value, m = get("month").value;
      if (!y || !m) throw new Error(`Pick ${kid.name}'s birth month and year.`);
      kid.birth_month = `${y}-${m}`;
    } else {
      const a = get("age").value;
      if (a === "" || Number(a) < 0 || Number(a) > 18) throw new Error(`Enter ${kid.name}'s age (0 to 18).`);
      kid.age = Number(a);
    }
    kid.weekday_earliest = get("time").value || null;
    kid.weekends = get("weekends").checked;
    if (!kid.weekday_earliest && !kid.weekends) throw new Error(`${kid.name} needs weekday times, weekends, or both.`);
    kid.swim_level = get("swim").value ? Number(get("swim").value) : null;
    kid.exclude_categories = [...card.querySelectorAll("details input:checked")].map((b) => b.value);
    return kid;
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = !message;
  }

  function save() {
    try {
      const kids = [...kidsEl.children].map(readKid);
      const names = kids.map((k) => k.name.toLowerCase());
      if (new Set(names).size !== names.length) throw new Error("Two kids have the same name.");
      const payload = JSON.stringify({ v: 1, kids: kids });
      if (new TextEncoder().encode(payload).length > MAX_BYTES) throw new Error("That's too much to save; remove a kid or some categories.");
      showError("");
      let sent = false;
      const send = () => { if (!sent) { sent = true; tg.sendData(payload); } }; // closes the form
      if (tg.isVersionAtLeast && tg.isVersionAtLeast("6.9")) {
        tg.CloudStorage.setItem(STORAGE_KEY, payload, send);
        setTimeout(send, STORAGE_WAIT_MS); // saving the prefill copy must never block the real save
      } else {
        send();
      }
    } catch (e) {
      showError(e.message);
    }
  }

  document.getElementById("add").addEventListener("click", () => addKid());

  if (!inTelegram) {
    document.getElementById("outside").hidden = false;
    addKid();
    return;
  }
  tg.ready();
  tg.expand();
  tg.MainButton.setText("Save");
  tg.MainButton.onClick(save);
  tg.MainButton.show();
  let rendered = false;
  const render = (stored) => {
    if (rendered) return;
    rendered = true;
    let kids = [];
    try { kids = (JSON.parse(stored || "{}").kids || []).slice(0, MAX_KIDS); } catch (e) { kids = []; }
    if (kids.length) kids.forEach(addKid); else addKid();
  };
  if (tg.isVersionAtLeast && tg.isVersionAtLeast("6.9")) {
    tg.CloudStorage.getItem(STORAGE_KEY, (err, value) => render(err ? "" : value));
    setTimeout(() => render(""), STORAGE_WAIT_MS);
  } else {
    render("");
  }
})();
