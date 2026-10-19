const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const PAGES = [
  "loadingPage",
  "homePage",
  "browsePage",
  "createPage",
  "avatarPage",
  "roomPage"
];

const AVATARS = ["🐺", "🦊", "🐱", "🐼", "🐸", "🦉", "🐰", "🦁"];
const COLORS = [
  "#8b5cf6",
  "#ec4899",
  "#3b82f6",
  "#14b8a6",
  "#f59e0b",
  "#ef4444"
];

const ROLE_NAMES = {
  villager: "ชาวบ้าน",
  wolf: "หมาป่า",
  sheriff: "นายอำเภอ",
  doctor: "หมอ",
  seer: "ผู้หยั่งรู้",
  cupid: "ผู้ผูกคู่รัก",
  knight: "อัศวิน",
  police: "ตำรวจ",
  loneWolf: "หมาป่าเดียวดาย",
  hybrid: "ลูกครึ่ง",
  alpha: "จ่าฝูง",
  priest: "นักบวช",
  jester: "ตัวตลก",
  pet: "สัตว์เลี้ยง",
  owner: "เจ้าของ"
};

const CHANNEL_NAMES = {
  public: "ทุกคน",
  wolves: "หมาป่า",
  lovers: "คู่รัก",
  dead: "ผู้ตาย"
};

let me = null;
let socket = null;
let room = null;
let publicRoomList = [];
let currentPage = "loadingPage";
let pairPick = [];
let pairKey = "";
let channel = "public";
let selectedAvatar = AVATARS[0];
let selectedColor = COLORS[0];
let toastTimer;
let actionKey = "";
let lastMessagesKey = "";

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function toast(text) {
  $("#toast").textContent = text;
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").hidden = true, 3500);
}

function showPage(id) {
  currentPage = id;
  for (const page of PAGES) {
    $("#" + page).hidden = page !== id;
  }
  if (id === "avatarPage" && me) {
    selectedAvatar = me.avatar;
    selectedColor = me.color;
    $("#nameInput").value = me.name;
    renderAvatar();
  }
  if (id === "browsePage") renderRooms();
}

function emit(event, data = {}) {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) return reject(new Error("ยังเชื่อมต่อไม่ได้"));
    socket.timeout(8000).emit(event, data, (error, result) => {
      if (error) return reject(new Error("เซิร์ฟเวอร์ช้า ลองอีกที"));
      if (!result?.ok) return reject(new Error(result?.error || "มีบางอย่างผิดพลาด"));
      resolve(result);
    });
  });
}

async function attempt(task) {
  try {
    return await task();
  } catch (error) {
    toast(error.message);
    return null;
  }
}

const TOKEN_SUFFIX = new URLSearchParams(location.search).get("as") || "";
const TOKEN_KEY = "ww_token" + TOKEN_SUFFIX;
const PROFILE_KEY = "ww_profile" + TOKEN_SUFFIX;
let memoryToken = "";

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

function getToken() {
  try {
    let token = localStorage.getItem(TOKEN_KEY);
    if (!/^[A-Za-z0-9_-]{24,64}$/.test(token || "")) {
      token = randomToken();
      localStorage.setItem(TOKEN_KEY, token);
    }
    return token;
  } catch {
    return memoryToken ||= randomToken();
  }
}

function loadProfile() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveProfile() {
  if (!me) return;
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ name: me.name, avatar: me.avatar, color: me.color }));
  } catch {}
}

function renderAccount() {
  if (!me) {
    $("#account").innerHTML = "";
    return;
  }
  saveProfile();
  $("#account").innerHTML = `
    <button id="profileButton" class="secondary" type="button">
      <span class="avatar small" style="--avatar-color:${esc(me.color)}">${esc(me.avatar)}</span>
      <span>${esc(me.name)}</span>
    </button>
  `;
  $("#homeName").textContent = `สวัสดี ${me.name}`;
  $("#profileButton").onclick = () => {
    if (room) return toast("ออกจากห้องก่อน จึงจะแก้ชื่อและรูปได้");
    showPage("avatarPage");
  };
}

// ---------- แจ้งเตือนกลางหน้าจอ ----------
const ANNOUNCE_ICONS = { death: "💀", vote: "⚖️", tie: "🤝", safe: "🌅", revive: "✨", phase: "🌙", end: "🏁" };
let announceQueue = [];
let announceBusy = false;
let announceTimer;

function pushAnnounce(item) {
  if (item.kind === "phase" && (announceBusy || announceQueue.length)) return;
  if (announceQueue.length >= 6) announceQueue.shift();
  announceQueue.push(item);
  runAnnounce();
}

function runAnnounce() {
  if (announceBusy) return;
  const item = announceQueue.shift();
  if (!item) return;
  announceBusy = true;

  const layer = $("#announceLayer");
  layer.innerHTML = `
    <div class="announce-card kind-${esc(item.kind)}">
      <div class="announce-icon">${ANNOUNCE_ICONS[item.kind] || "📣"}</div>
      <h2>${esc(item.title)}</h2>
      ${item.players?.length ? `<div class="announce-players">${item.players.map(p => `
        <div class="announce-player">
          <div class="avatar" style="--avatar-color:${esc(p.color)}">${esc(p.avatar)}</div>
          <b>${esc(p.name)}</b>
          ${p.roleName ? `<small>บทบาท: ${esc(p.roleName)}</small>` : ""}
          ${p.note ? `<small>${esc(p.note)}</small>` : ""}
        </div>`).join("")}</div>` : ""}
      ${item.text ? `<p class="muted" style="margin:6px 0 0">${esc(item.text)}</p>` : ""}
    </div>
  `;
  layer.hidden = false;

  const done = () => {
    clearTimeout(announceTimer);
    layer.hidden = true;
    layer.innerHTML = "";
    announceBusy = false;
    setTimeout(runAnnounce, 250);
  };
  layer.firstElementChild.onclick = done;
  announceTimer = setTimeout(done, item.kind === "phase" ? 2200 : item.kind === "end" ? 7000 : 4500);
}

function clearAnnounce() {
  announceQueue = [];
  clearTimeout(announceTimer);
  announceBusy = false;
  $("#announceLayer").hidden = true;
  $("#announceLayer").innerHTML = "";
}

function connect() {
  const token = getToken();
  socket?.disconnect();
  socket = io({ auth: cb => cb({ token, ...loadProfile() }) });

  socket.on("connect", () => { $("#connection").hidden = true; });
  socket.on("disconnect", () => {
    $("#connection").hidden = false;
    $("#connection").textContent = "หลุดจากเซิร์ฟเวอร์ กำลังต่อใหม่ เกมยังเล่นอยู่";
  });
  socket.on("connect_error", error => {
    $("#connection").hidden = false;
    $("#connection").textContent = error.message;
  });
  socket.on("me", user => {
    me = user;
    renderAccount();
    if (currentPage === "loadingPage") showPage("homePage");
  });
  socket.on("rooms", data => {
    publicRoomList = data;
    renderRooms();
  });
  socket.on("announce", pushAnnounce);
  socket.on("state", data => {
    const changedRoom = room?.id !== data?.id;
    room = data;
    if (!room) {
      actionKey = "";
      lastMessagesKey = "";
      clearAnnounce();
      if (["roomPage", "loadingPage"].includes(currentPage)) showPage("homePage");
      return;
    }
    if (changedRoom) {
      channel = "public";
      actionKey = "";
      lastMessagesKey = "";
    }
    const self = room.players.find(p => p.id === me.id);
    if (self) {
      me.name = self.name;
      me.avatar = self.avatar;
      me.color = self.color;
      renderAccount();
    }
    showPage("roomPage");
    renderRoom();
  });
}

$$("[data-page]").forEach(button => {
  button.onclick = () => showPage(button.dataset.page);
});

function renderRooms() {
  $("#publicRooms").innerHTML = publicRoomList.length
    ? publicRoomList.map(r => `
      <div class="room-item">
        <div class="row between">
          <strong>${esc(r.title)}</strong>
          <span class="badge">${r.count} / ${r.capacity ?? "∞"} คน</span>
        </div>
        <p class="muted" style="margin:10px 0">ห้อง ${esc(r.id)} · หมาป่า ${r.wolfPercent}%</p>
        <button data-join="${esc(r.id)}" ${r.capacity && r.count >= r.capacity ? "disabled" : ""}>เข้าห้อง</button>
      </div>
    `).join("")
    : '<p class="muted">ยังไม่มีห้องสาธารณะ ลองสร้างเองเลย</p>';

  $$("[data-join]").forEach(button => {
    button.onclick = () => attempt(() => emit("join", { id: button.dataset.join }));
  });
}

$("#joinForm").onsubmit = event => {
  event.preventDefault();
  attempt(() => emit("join", { id: $("#joinCode").value.trim() }));
};

$("#createForm").onsubmit = event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const roles = {};
  form.getAll("role").forEach(role => roles[role] = true);

  attempt(() => emit("create", {
    title: form.get("title"),
    capacity: form.get("capacity"),
    visibility: form.get("visibility"),
    wolfPercent: Number(form.get("wolfPercent")),
    nightSeconds: Number(form.get("nightSeconds")),
    daySeconds: Number(form.get("daySeconds")),
    voteSeconds: Number(form.get("voteSeconds")),
    roles
  }));
};

function renderAvatar() {
  $("#avatarPreview").textContent = selectedAvatar;
  $("#avatarPreview").style.setProperty("--avatar-color", selectedColor);

  $("#avatarChoices").innerHTML = AVATARS.map(avatar => `
    <button type="button" data-avatar="${avatar}" class="${avatar === selectedAvatar ? "selected" : ""}">
      ${avatar}
    </button>
  `).join("");

  $("#colorChoices").innerHTML = COLORS.map(color => `
    <button type="button" data-color="${color}" aria-label="เลือกสี ${color}" style="background:${color}" class="${color === selectedColor ? "selected" : ""}">
    </button>
  `).join("");

  $$("[data-avatar]").forEach(button => {
    button.onclick = () => {
      selectedAvatar = button.dataset.avatar;
      renderAvatar();
    };
  });

  $$("[data-color]").forEach(button => {
    button.onclick = () => {
      selectedColor = button.dataset.color;
      renderAvatar();
    };
  });
}

$("#saveAvatar").onclick = () => attempt(async () => {
  const result = await emit("avatar", { avatar: selectedAvatar, color: selectedColor });
  me = result.user;
  renderAccount();
  toast("บันทึกแล้ว");
});

$("#nameForm").onsubmit = event => {
  event.preventDefault();
  attempt(async () => {
    const result = await emit("rename", { name: $("#nameInput").value });
    me = result.user;
    renderAccount();
    toast("เปลี่ยนชื่อแล้ว");
  });
};

$("#randomName").onclick = () => attempt(async () => {
  const result = await emit("rename", { random: true });
  me = result.user;
  $("#nameInput").value = me.name;
  renderAccount();
  toast("สุ่มชื่อใหม่แล้ว");
});

$("#copyCode").onclick = () => attempt(async () => {
  if (!navigator.clipboard) {
    toast(`เลขห้อง: ${room.id}`);
    return;
  }
  await navigator.clipboard.writeText(room.id);
  toast("คัดลอกเลขห้องแล้ว");
});

$("#leaveRoom").onclick = () => attempt(async () => {
  if (room && !["lobby", "ended"].includes(room.phase)) {
    if (!confirm("ออกจากเกมเลยไหม? ออกแล้วกลับมาเล่นรอบนี้ไม่ได้")) return;
  }
  await emit("leave");
});

function renderRoom() {
  $("#roomTitle").textContent = room.title;
  $("#roomCode").textContent = "เลขห้อง " + room.id;
  $("#roomVisibility").textContent = room.settings.visibility === "private" ? "ส่วนตัว" : "สาธารณะ";
  $("#phaseLabel").textContent = room.phaseName + (room.round && room.phase !== "lobby" ? ` · ${room.phase === "night" ? "คืน" : "วัน"}ที่ ${room.round}` : "");
  $("#playerCount").textContent = `${room.players.length} / ${room.settings.capacity ?? "∞"} คน`;

  $("#leaveRoom").disabled = false;
  $("#leaveRoom").textContent = ["lobby", "ended"].includes(room.phase) ? "ออกจากห้อง" : "ออกจากเกม";

  renderLobby();
  renderSettings();
  renderPlayers();
  renderRole();
  renderAction();
  renderResult();
  renderChat();
  tick();
}

function renderLobby() {
  const panel = $("#lobbyControls");
  panel.hidden = room.phase !== "lobby";
  if (panel.hidden) return;

  const plan = room.plan;
  const specialNames = plan.specials.map(role => ROLE_NAMES[role]).join(", ");
  let warning = "";

  if (plan.trimmed) {
    warning += `<p class="muted">เลือกบทบาทไว้ ${plan.requested} แต่คนไม่พอ จะสุ่มใช้ ${plan.used} บทบาท</p>`;
  }
  const notReady = room.players.filter(p => !p.ready).length;
  const offline = room.players.filter(p => !p.online).length;
  const canStart = room.players.length >= 4 && !notReady && !offline;
  if (room.players.length < 4) {
    warning += `<p class="bad">ต้องมีอย่างน้อย 4 คน</p>`;
  }
  if (notReady) warning += `<p class="bad">ยังไม่พร้อม ${notReady} คน</p>`;
  if (offline) warning += `<p class="bad">ออฟไลน์ ${offline} คน</p>`;

  panel.innerHTML = `
    <h3>ก่อนเริ่มเกม</h3>
    <div class="row">
      <span class="badge">หมาป่า ${plan.wolves} คน (${room.settings.wolfPercent}%)</span>
      <span class="badge">ชาวบ้านธรรมดา ${plan.villagers} คน</span>
      <span class="badge">ฝ่ายอิสระ ${plan.neutrals.length} คน</span>
    </div>
    <small>บทบาทพิเศษ: ${esc(specialNames || "ไม่มี")}</small>
    <small>กลางคืน ${room.settings.nightSeconds}s · คุย ${room.settings.daySeconds}s · โหวต ${room.settings.voteSeconds}s</small>
    ${warning}
    <div class="row">
      <button id="readyButton" class="${room.me.ready ? "secondary" : "success"}">
        ${room.me.ready ? "ยกเลิกพร้อม" : "พร้อมแล้ว"}
      </button>
      ${room.hostId === me.id ? `<button id="startButton" ${canStart ? "" : "disabled"}>เริ่มเกม</button>` : "<small>รอเจ้าของห้องกดเริ่ม</small>"}
    </div>
  `;

  $("#readyButton").onclick = () => attempt(() => emit("ready"));
  if ($("#startButton")) {
    $("#startButton").onclick = () => attempt(() => emit("start"));
  }
}

const ROLE_OPTIONS = [
  ["sheriff", "นายอำเภอ: โหวตนับ 2 คะแนน"],
  ["doctor", "หมอ: ช่วยคนไม่ให้ตาย"],
  ["seer", "ผู้หยั่งรู้: ตรวจว่าใครเป็นหมาป่า"],
  ["cupid", "ผู้ผูกคู่รัก: เลือกคู่รักคืนแรก"],
  ["knight", "อัศวิน: กันภัยให้คนอื่น 1 ครั้ง"],
  ["police", "ตำรวจ: จัดการคน 1 ครั้ง ถ้าผิดตัวเองก็ออก"],
  ["priest", "นักบวช: ชุบชีวิตคน 1 ครั้ง"],
  ["jester", "ตัวตลก: ถูกโหวตออกคือชนะ"],
  ["pet", "สัตว์เลี้ยงกับเจ้าของ: มาเป็นคู่"]
];
const WOLF_OPTIONS = [
  ["loneWolf", "หมาป่าเดียวดาย: ไม่รู้ว่าใครเป็นพวก และไม่มีแชทหมาป่า"],
  ["hybrid", "ลูกครึ่ง: ผู้หยั่งรู้จะเห็นเป็นชาวบ้าน"],
  ["alpha", "จ่าฝูง: โหวตกลางคืนนับ 2 คะแนน"]
];

let settingsKey = "";

function renderSettings() {
  const panel = $("#settingsPanel");
  const isHost = room.hostId === me.id;
  panel.hidden = room.phase !== "lobby" || !isHost;
  if (panel.hidden) {
    settingsKey = "";
    return;
  }

  // สร้างฟอร์มใหม่เฉพาะเมื่อค่าตั้งค่าเปลี่ยน เพื่อไม่ให้ที่กำลังพิมพ์อยู่หาย
  const key = JSON.stringify([room.id, room.title, room.settings]);
  if (key === settingsKey) return;
  settingsKey = key;

  const wasOpen = panel.querySelector("details")?.open;
  const s = room.settings;
  const check = ([value, label]) => `
    <label class="check-row">
      <input type="checkbox" name="role" value="${value}" ${s.roles[value] ? "checked" : ""}> ${esc(label)}
    </label>`;

  panel.innerHTML = `
    <details ${wasOpen ? "open" : ""}>
      <summary><b>ตั้งค่าห้อง</b> (เฉพาะเจ้าของห้อง)</summary>
      <form id="settingsForm" class="stack" style="margin-top:14px">
        <div class="grid2">
          <label>ชื่อห้อง<input name="title" maxlength="50" value="${esc(room.title)}" required></label>
          <label>จำนวนผู้เล่นสูงสุด
            <input name="capacity" type="number" min="4" step="1" value="${s.capacity ?? ""}" placeholder="เว้นว่าง = ไม่จำกัด">
          </label>
          <label>สถานะห้อง
            <select name="visibility">
              <option value="private" ${s.visibility === "private" ? "selected" : ""}>ส่วนตัว (ต้องมีเลขห้อง)</option>
              <option value="public" ${s.visibility === "public" ? "selected" : ""}>สาธารณะ (ขึ้นในรายการ)</option>
            </select>
          </label>
          <label>หมาป่ากี่ %
            <input name="wolfPercent" type="number" min="1" max="49" value="${s.wolfPercent}" required>
          </label>
        </div>
        <h3>บทบาทพิเศษ (ชาวบ้านและฝ่ายอิสระ)</h3>
        <div class="grid2">${ROLE_OPTIONS.map(check).join("")}</div>
        <h3>หมาป่าพิเศษ</h3>
        <div class="grid2">${WOLF_OPTIONS.map(check).join("")}</div>
        <div class="grid3">
          <label>กลางคืน (วินาที)<input name="nightSeconds" type="number" min="15" max="600" value="${s.nightSeconds}" required></label>
          <label>คุย (วินาที)<input name="daySeconds" type="number" min="15" max="600" value="${s.daySeconds}" required></label>
          <label>โหวต (วินาที)<input name="voteSeconds" type="number" min="15" max="600" value="${s.voteSeconds}" required></label>
        </div>
        <small>เลือกเกินจำนวนคนได้ ตอนเริ่มจะสุ่มให้พอดี</small>
        <button>บันทึก</button>
      </form>
    </details>
  `;

  $("#settingsForm").onsubmit = event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const roles = {};
    form.getAll("role").forEach(role => roles[role] = true);
    attempt(async () => {
      await emit("settings", {
        title: form.get("title"),
        capacity: form.get("capacity"),
        visibility: form.get("visibility"),
        wolfPercent: Number(form.get("wolfPercent")),
        nightSeconds: Number(form.get("nightSeconds")),
        daySeconds: Number(form.get("daySeconds")),
        voteSeconds: Number(form.get("voteSeconds")),
        roles
      });
      toast("บันทึกแล้ว");
    });
  };
}

// ---------- เลือกเป้าหมายด้วยการแตะการ์ดผู้เล่น ----------
function interaction() {
  if (!room || !room.me.alive) return null;
  const m = room.me;
  const alive = room.players.filter(p => p.alive);
  const dead = room.players.filter(p => !p.alive && !p.left);
  const ids = list => new Set(list.map(p => p.id));

  if (room.phase === "vote") {
    return {
      type: "vote",
      title: "โหวตคนที่สงสัย",
      help: "แตะการ์ดผู้เล่นเพื่อโหวต แตะซ้ำเพื่อยกเลิก เปลี่ยนได้จนกว่าจะหมดเวลา หรือทุกคนโหวตครบ",
      targets: ids(alive),
      choice: m.vote,
      counts: room.tally || {},
      skipCount: room.skipCount || 0,
      progress: room.progress
    };
  }
  if (room.phase !== "night") return null;

  const role = m.role;
  const base = (title, help, list, counts = null) => ({
    type: "action", title, help, targets: ids(list), choice: m.choice, counts
  });

  if (role === "cupid" && room.round === 1) {
    const key = room.id + ":" + room.round;
    if (key !== pairKey) {
      pairKey = key;
      pairPick = Array.isArray(m.choice) ? [...m.choice] : [];
    }
    return {
      type: "pair",
      title: "เลือกคู่รัก 2 คน",
      help: "แตะการ์ด 2 ใบแล้วกดยืนยัน เลือกตัวเองได้ ถ้าคนหนึ่งออก อีกคนจะออกตาม เปลี่ยนได้จนกว่าจะหมดเวลา",
      targets: ids(alive),
      choice: m.choice
    };
  }
  if (role === "priest") {
    return m.priestUsed || !dead.length ? null : base("เลือกคนที่จะชุบชีวิต", "ใช้ได้ครั้งเดียว เปลี่ยนใจหรือข้ามได้จนกว่าจะหมดเวลา", dead);
  }
  if (role === "police") {
    return m.policeUsed ? null : base("เลือกคนที่จะจัดการ", "ใช้ได้ครั้งเดียว ถ้าไม่ใช่หมาป่า คุณจะออกจากเกมด้วย (ข้ามได้ ไม่เสียสิทธิ์)", alive.filter(p => p.id !== me.id));
  }
  if (m.faction === "wolf") {
    const targets = role === "loneWolf" ? alive.filter(p => p.id !== me.id) : alive.filter(p => p.faction !== "wolf");
    const help = role === "loneWolf"
      ? "คุณไม่รู้ว่าใครเป็นพวก อาจเลือกโดนหมาป่าด้วยกันเอง"
      : role === "alpha"
        ? "โหวตของคุณนับ 2 คะแนน เลขบนการ์ดคือคะแนนของฝูง"
        : "เลขบนการ์ดคือคะแนนของฝูง คุยในแชทหมาป่าก่อนเลือก";
    return base("เลือกคนที่จะกำจัด", help, targets, role === "loneWolf" ? null : room.tally);
  }
  if (role === "doctor") return base("เลือกคนที่จะช่วย", "เลือกตัวเองได้ แต่เลือกคนเดิมติดกันไม่ได้", alive.filter(p => p.id !== m.lastHeal));
  if (role === "seer") return base("เลือกคนที่จะตรวจ", "ผลจะขึ้นในโน้ตลับตอนจบคืน (ลูกครึ่งจะแสดงว่าไม่ใช่หมาป่า)", alive.filter(p => p.id !== me.id));
  if (role === "knight") return m.knightUsed ? null : base("เลือกคนที่จะปกป้อง", "ปกป้องสำเร็จแล้วพลังจะหมด", alive);
  return null;
}

function pickTarget(id) {
  const I = interaction();
  if (!I || !I.targets.has(id)) return;

  if (I.type === "pair") {
    const index = pairPick.indexOf(id);
    if (index >= 0) pairPick.splice(index, 1);
    else {
      pairPick.push(id);
      if (pairPick.length > 2) pairPick.shift();
    }
    renderPlayers();
    renderAction();
    return;
  }
  submitChoice(I, I.choice === id ? null : id);
}

// value: null = ยกเลิก, "skip" = ข้าม, อื่น ๆ = id เป้าหมาย
function submitChoice(I, value) {
  if (I.type === "vote") return attempt(() => emit("vote", { target: value }));
  return attempt(() => emit("action", value === null ? { clear: true } : value === "skip" ? { skip: true } : { target: value }));
}

$("#players").onclick = event => {
  const cardEl = event.target.closest("[data-pid]");
  if (cardEl) pickTarget(cardEl.dataset.pid);
};
$("#players").onkeydown = event => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const cardEl = event.target.closest("[data-pid]");
  if (cardEl) {
    event.preventDefault();
    pickTarget(cardEl.dataset.pid);
  }
};

function renderPlayers() {
  const I = interaction();
  $("#players").innerHTML = room.players.map(player => {
    const selectable = Boolean(I && I.targets.has(player.id));
    const selected = I ? (I.type === "pair" ? pairPick.includes(player.id) : I.choice === player.id) : false;
    const count = I?.counts?.[player.id] || 0;
    return `
    <div class="player ${player.alive ? "" : "out"} ${player.id === me.id ? "self" : ""} ${selectable ? "selectable" : ""} ${selected ? "selected" : ""}"
         data-pid="${esc(player.id)}" ${selectable ? 'role="button" tabindex="0"' : ""}>
      ${count ? `<span class="count-badge" title="จำนวนคะแนน">${count}</span>` : ""}
      <div class="avatar" style="--avatar-color:${esc(player.color)}">${esc(player.avatar)}</div>
      <div class="player-name">${esc(player.name)}</div>
      <div class="row" style="justify-content:center;gap:5px">
        ${player.id === room.hostId ? '<span class="badge">เจ้าของห้อง</span>' : ""}
        ${player.id === me.id ? '<span class="badge">คุณ</span>' : ""}
        ${player.lover ? '<span class="badge">คู่รัก</span>' : ""}
        ${player.bonded ? '<span class="badge">คู่หู</span>' : ""}
      </div>
      <small class="${player.online ? "good" : "bad"}">${player.online ? "ออนไลน์" : "ออฟไลน์"}</small>
      ${room.phase === "lobby" ? `<small class="${player.ready ? "good" : ""}">${player.ready ? "พร้อมแล้ว" : "ยังไม่พร้อม"}</small>` : `<small>${player.left ? "ออกจากห้องแล้ว" : player.alive ? "ยังอยู่" : "ออกแล้ว"}</small>`}
      ${player.roleName ? `<small>${esc(player.roleName)}</small>` : ""}
      ${selected ? '<small class="pick-note">✓ ที่คุณเลือก</small>' : ""}
    </div>`;
  }).join("");
}

function renderRole() {
  const panel = $("#rolePanel");
  panel.hidden = room.phase === "lobby";
  if (!panel.hidden) {
    panel.innerHTML = `
      <div class="eyebrow">บทบาทของคุณ</div>
      <h2>${esc(room.me.roleName)}</h2>
      <p>${esc(room.me.description)}</p>
      ${!room.me.alive ? '<span class="badge bad">คุณออกจากเกมแล้ว คุยในแชทผู้ตายได้</span>' : ""}
      ${room.me.clue ? `
        <div class="clue">
          <small>วันที่ ${room.me.clue.round} · ${esc(room.me.clue.type)}</small>
          <strong>${esc(room.me.clue.text)}</strong>
          <small>จะบอกคนอื่นหรือเก็บไว้ก็ได้</small>
        </div>
      ` : room.me.faction === "wolf" && room.round >= 1 ? `
        <div class="clue">
          <small>วันที่ ${room.round}</small>
          <strong>คุณไม่ได้รับคำ</strong>
          <small>ฟังคำใบ้ของคนอื่นแล้วแกล้งทำเป็นรู้ อย่าให้ใครจับได้</small>
        </div>
      ` : ""}
    `;
  }

  $("#notesPanel").hidden = !room.me.notes.length;
  $("#notes").innerHTML = room.me.notes.map(note => `<li>${esc(note)}</li>`).join("");
}

function renderAction() {
  const panel = $("#actionPanel");
  panel.hidden = true;
  panel.innerHTML = "";

  if (!room.me.alive || ["lobby", "ended"].includes(room.phase)) return;

  const show = html => {
    panel.hidden = false;
    panel.innerHTML = html;
  };
  const nameOf = id => room.players.find(p => p.id === id)?.name || "?";
  const I = interaction();

  if (I) {
    let status;
    if (I.type === "pair") {
      status = Array.isArray(I.choice)
        ? `ยืนยันแล้ว: ${I.choice.map(nameOf).join(" + ")}`
        : I.choice === "skip" ? "ข้ามแล้ว" : pairPick.length ? `เลือกไว้: ${pairPick.map(nameOf).join(" + ")} (ยังไม่ยืนยัน)` : "ยังไม่ได้เลือก";
    } else {
      status = I.choice === "skip" ? "ข้ามแล้ว" : I.choice ? `เลือกอยู่: ${nameOf(I.choice)}` : "ยังไม่ได้เลือก";
    }
    const progress = I.progress ? `<small>โหวตแล้ว ${I.progress.done}/${I.progress.total} คน</small>` : "";

    show(`
      <h3>${esc(I.title)}</h3>
      <div class="stack">
        <p class="${I.choice ? "good" : "muted"}" style="margin:0">${esc(status)}</p>
        <div class="row">
          ${I.type === "pair" ? `<button id="pairConfirm" ${pairPick.length === 2 ? "" : "disabled"}>ยืนยันคู่รัก</button>` : ""}
          <button id="skipButton" class="${I.choice === "skip" ? "success" : "secondary"}">${I.choice === "skip" ? "✓ ข้ามอยู่ (แตะเพื่อยกเลิก)" : "ข้าม"}${I.type === "vote" ? ` (${I.skipCount})` : ""}</button>
        </div>
        ${progress}
        <small>${esc(I.help)}</small>
      </div>
    `);
    $("#skipButton").onclick = () => submitChoice(I, I.choice === "skip" ? null : "skip");
    if (I.type === "pair") {
      $("#pairConfirm").onclick = () => attempt(() => emit("action", { targets: pairPick }));
    }
    return;
  }

  if (room.phase === "day") {
    show(`
      <h3>ช่วงคุยกัน</h3>
      <p class="muted">${room.round === 1 ? "วันแรกยังโหวตไม่ได้ " : ""}คุยกัน ถามกัน แล้วดูว่าใครมีพิรุธ ระวังตัวตลกที่อยากโดนโหวต</p>
    `);
    return;
  }

  const m = room.me;
  let text = "คืนนี้ไม่มีอะไรให้ทำ รอตอนเช้า";
  if (m.role === "priest") text = m.priestUsed ? "ใช้ชุบชีวิตไปแล้ว" : "ยังไม่มีผู้ออกจากเกมให้ชุบชีวิต";
  else if (m.role === "police" && m.policeUsed) text = "ใช้พลังตำรวจไปแล้ว";
  else if (m.role === "knight" && m.knightUsed) text = "ใช้พลังอัศวินไปแล้ว";
  else if (m.role === "jester") text = "เป้าหมายคือให้คนโหวตคุณออกตอนกลางวัน";
  show(`<h3>รอช่วงถัดไป</h3><p class="muted">${esc(text)}</p>`);
}

function renderResult() {
  const panel = $("#resultPanel");
  panel.hidden = room.phase !== "ended";
  if (panel.hidden) return;

  panel.innerHTML = `
    <h2>${esc(room.winner)}</h2>
    <p class="muted">เปิดบทบาททุกคนแล้ว ดูได้ในรายชื่อผู้เล่น</p>
    <details>
      <summary>ดูคำใบ้ของแต่ละวัน</summary>
      ${room.clueHistory.map(c => `<p style="margin-top:12px"><b>วันที่ ${c.round}</b><br>${esc(c.sentence)}</p>`).join("")}
    </details>
    ${room.hostId === me.id ? '<button id="resetGame" style="margin-top:16px">เล่นอีกรอบ</button>' : '<p class="muted" style="margin-top:16px">รอเจ้าของห้องเริ่มรอบใหม่</p>'}
  `;

  if ($("#resetGame")) {
    $("#resetGame").onclick = () => attempt(() => emit("reset"));
  }
}

function renderChat() {
  if (!room.readChannels.includes(channel)) {
    channel = room.writeChannels[0] || "public";
  }

  $("#chatTabs").innerHTML = room.readChannels.map(item => `
    <button class="secondary ${item === channel ? "active" : ""}" data-channel="${item}">
      ${CHANNEL_NAMES[item]}
    </button>
  `).join("");

  $$("[data-channel]").forEach(button => {
    button.onclick = () => {
      channel = button.dataset.channel;
      renderChat();
    };
  });

  const canWrite = room.writeChannels.includes(channel);
  $("#chatInput").disabled = !canWrite;
  $("#chatSend").disabled = !canWrite;
  $("#chatInput").placeholder = canWrite ? "พิมพ์ข้อความ..." : "ตอนนี้พิมพ์ในช่องนี้ไม่ได้";
  $("#chatStatus").textContent = canWrite ? "ไม่เกิน 300 ตัวอักษร" : "ช่วงนี้ส่งข้อความในช่องนี้ไม่ได้";

  const messages = room.messages.filter(m => m.channel === channel);
  const key = channel + ":" + messages.map(m => m.id).join(",");
  if (key === lastMessagesKey) return;
  lastMessagesKey = key;

  const container = $("#messages");
  const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 70;

  container.innerHTML = messages.map(m => `
    <div class="message ${m.senderId ? "" : "system"}">
      <b>${esc(m.name)}</b>
      <time>${new Date(m.time).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</time>
      <p>${esc(m.text)}</p>
    </div>
  `).join("") || '<small class="muted">ยังไม่มีข้อความ</small>';

  if (nearBottom || container.scrollTop === 0) {
    container.scrollTop = container.scrollHeight;
  }
}

$("#chatForm").onsubmit = event => {
  event.preventDefault();
  const text = $("#chatInput").value.trim();
  if (!text) return;
  attempt(async () => {
    await emit("chat", { channel, text });
    if ($("#chatInput").value.trim() === text) $("#chatInput").value = "";
  });
};

function tick() {
  if (!room?.endsAt) {
    $("#countdown").textContent = room?.phase === "lobby" ? "รอเริ่ม" : "—";
    return;
  }
  const seconds = Math.max(0, Math.ceil((room.endsAt - Date.now()) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remaining = String(seconds % 60).padStart(2, "0");
  $("#countdown").textContent = `${minutes}:${remaining}`;
}

setInterval(tick, 250);

function boot() {
  renderAccount();
  showPage("loadingPage");
  connect();
}

boot();
