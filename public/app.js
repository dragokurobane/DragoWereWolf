const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const PAGES = [
  "authPage",
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
  public: "หมู่บ้าน",
  wolves: "หมาป่า",
  lovers: "คู่รัก",
  dead: "ผู้ตาย"
};

let me = null;
let socket = null;
let room = null;
let publicRoomList = [];
let registerMode = false;
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
  for (const page of PAGES) {
    $("#" + page).hidden = page !== id;
  }
  if (id === "avatarPage" && me) {
    selectedAvatar = me.avatar;
    selectedColor = me.color;
    renderAvatar();
  }
  if (id === "browsePage") renderRooms();
}

async function api(path, data) {
  const response = await fetch("/api/" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: data === undefined ? undefined : JSON.stringify(data)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "เกิดข้อผิดพลาด");
  return result;
}

function emit(event, data = {}) {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) return reject(new Error("ยังไม่ได้เชื่อมต่อเซิร์ฟเวอร์"));
    socket.timeout(8000).emit(event, data, (error, result) => {
      if (error) return reject(new Error("เซิร์ฟเวอร์ตอบกลับช้า กรุณาลองใหม่"));
      if (!result?.ok) return reject(new Error(result?.error || "เกิดข้อผิดพลาด"));
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

function renderAccount() {
  if (!me) {
    $("#account").innerHTML = '<small>เกมจับพิรุธกับเพื่อน</small>';
    return;
  }
  $("#account").innerHTML = `
    <div class="avatar small" style="--avatar-color:${esc(me.color)}">${esc(me.avatar)}</div>
    <span>${esc(me.name)}</span>
    <button id="logout" class="secondary">ออกจากระบบ</button>
  `;
  $("#logout").onclick = () => attempt(async () => {
    if (room && !["lobby", "ended"].includes(room.phase)) {
      if (!confirm("เกมยังดำเนินต่อแม้คุณออกจากระบบ ต้องการออกหรือไม่?")) return;
    }
    await api("logout", {});
    socket?.disconnect();
    me = null;
    room = null;
    $("#connection").hidden = true;
    renderAccount();
    showPage("authPage");
  });
}

function connect() {
  socket?.disconnect();
  socket = io();

  socket.on("connect", () => { $("#connection").hidden = true; });
  socket.on("disconnect", () => {
    $("#connection").hidden = false;
    $("#connection").textContent = "การเชื่อมต่อขาดหาย เกมยังดำเนินต่อ ระบบจะพยายามเชื่อมต่อใหม่";
  });
  socket.on("connect_error", error => {
    $("#connection").hidden = false;
    $("#connection").textContent = error.message;
  });
  socket.on("rooms", data => {
    publicRoomList = data;
    renderRooms();
  });
  socket.on("state", data => {
    const changedRoom = room?.id !== data?.id;
    room = data;
    if (!room) {
      actionKey = "";
      lastMessagesKey = "";
      showPage("homePage");
      return;
    }
    if (changedRoom) {
      channel = "public";
      actionKey = "";
      lastMessagesKey = "";
    }
    const self = room.players.find(p => p.id === me.id);
    if (self) {
      me.avatar = self.avatar;
      me.color = self.color;
      renderAccount();
    }
    showPage("roomPage");
    renderRoom();
  });
}

$("#toggleAuth").onclick = () => {
  registerMode = !registerMode;
  $("#authTitle").textContent = registerMode ? "สร้างตัวตนของคุณ" : "เข้าสู่หมู่บ้าน";
  $("#authSubmit").textContent = registerMode ? "สมัครสมาชิก" : "ล็อกอิน";
  $("#toggleAuth").textContent = registerMode ? "มีบัญชีแล้ว? ล็อกอิน" : "ยังไม่มีบัญชี? สมัครสมาชิก";
  $("#authPassword").autocomplete = registerMode ? "new-password" : "current-password";
};

$("#authForm").onsubmit = async event => {
  event.preventDefault();
  $("#authSubmit").disabled = true;
  await attempt(async () => {
    const result = await api(registerMode ? "register" : "login", {
      name: $("#authName").value,
      password: $("#authPassword").value
    });
    me = result.user;
    $("#authPassword").value = "";
    renderAccount();
    showPage("homePage");
    connect();
  });
  $("#authSubmit").disabled = false;
};

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
        <button data-join="${esc(r.id)}" ${r.capacity && r.count >= r.capacity ? "disabled" : ""}>เข้าร่วม</button>
      </div>
    `).join("")
    : '<p class="muted">ยังไม่มีห้องสาธารณะ สร้างห้องแรกได้เลย</p>';

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
  toast("บันทึกอวตารแล้ว");
});

$("#copyCode").onclick = () => attempt(async () => {
  if (!navigator.clipboard) {
    toast(`เลขห้อง: ${room.id}`);
    return;
  }
  await navigator.clipboard.writeText(room.id);
  toast("คัดลอกเลขห้องแล้ว");
});

$("#leaveRoom").onclick = () => attempt(() => emit("leave"));

function renderRoom() {
  $("#roomTitle").textContent = room.title;
  $("#roomCode").textContent = "เลขห้อง " + room.id;
  $("#roomVisibility").textContent = room.settings.visibility === "private" ? "ส่วนตัว" : "สาธารณะ";
  $("#phaseLabel").textContent = room.phaseName + (room.round ? ` · รอบ ${room.round}` : "");
  $("#playerCount").textContent = `${room.players.length} / ${room.settings.capacity ?? "∞"} คน`;

  $("#leaveRoom").disabled = !["lobby", "ended"].includes(room.phase);
  $("#leaveRoom").textContent = $("#leaveRoom").disabled ? "ออกจากห้องได้หลังจบเกม — รีเฟรชแล้วกลับมาได้" : "ออกจากห้อง";

  renderLobby();
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

  if (!plan.enoughWolfSlots) {
    warning += `<p class="bad">โควตาหมาป่า ${plan.wolves} คน ไม่พอสำหรับหมาป่าพิเศษ ${plan.wolfSpecials.length} บทบาท</p>`;
  }
  if (!plan.enoughPlayerSlots) {
    warning += `<p class="bad">ผู้เล่นไม่พอสำหรับบทบาทที่เลือก กรุณารอผู้เล่นเพิ่ม</p>`;
  }

  panel.innerHTML = `
    <h3>เตรียมตัวก่อนเริ่มเกม</h3>
    <div class="row">
      <span class="badge">ฝ่ายหมาป่า ${room.settings.wolfPercent}% → ${plan.wolves} คน</span>
      <span class="badge">ชาวบ้านทั่วไป ${plan.villagers} คน</span>
      <span class="badge">ฝ่ายอิสระ ${plan.neutrals.length} คน</span>
    </div>
    <small>บทบาทพิเศษ: ${esc(specialNames || "ไม่มี")}</small>
    <small>กลางคืน ${room.settings.nightSeconds}s · สนทนา ${room.settings.daySeconds}s · โหวต ${room.settings.voteSeconds}s</small>
    ${warning}
    <div class="row">
      <button id="readyButton" class="${room.me.ready ? "secondary" : "success"}">
        ${room.me.ready ? "ยกเลิกพร้อม" : "ฉันพร้อมแล้ว"}
      </button>
      ${room.hostId === me.id ? `<button id="startButton" ${plan.enough ? "" : "disabled"}>เริ่มเกม</button>` : "<small>รอเจ้าของห้องเริ่มเกม</small>"}
    </div>
  `;

  $("#readyButton").onclick = () => attempt(() => emit("ready"));
  if ($("#startButton")) {
    $("#startButton").onclick = () => attempt(() => emit("start"));
  }
}

function renderPlayers() {
  $("#players").innerHTML = room.players.map(player => `
    <div class="player ${player.alive ? "" : "out"} ${player.id === me.id ? "self" : ""}">
      <div class="avatar" style="--avatar-color:${esc(player.color)}">${esc(player.avatar)}</div>
      <div class="player-name">${esc(player.name)}</div>
      <div class="row" style="justify-content:center;gap:5px">
        ${player.id === room.hostId ? '<span class="badge">เจ้าของห้อง</span>' : ""}
        ${player.id === me.id ? '<span class="badge">คุณ</span>' : ""}
        ${player.lover ? '<span class="badge">คู่รัก</span>' : ""}
        ${player.bonded ? '<span class="badge">คู่สายสัมพันธ์</span>' : ""}
      </div>
      <small class="${player.online ? "good" : "bad"}">${player.online ? "ออนไลน์" : "ออฟไลน์"}</small>
      ${room.phase === "lobby" ? `<small class="${player.ready ? "good" : ""}">${player.ready ? "พร้อมแล้ว" : "ยังไม่พร้อม"}</small>` : `<small>${player.alive ? "ยังอยู่ในเกม" : "ออกจากเกมแล้ว"}</small>`}
      ${player.roleName ? `<small>${esc(player.roleName)}</small>` : ""}
    </div>
  `).join("");
}

function renderRole() {
  const panel = $("#rolePanel");
  panel.hidden = room.phase === "lobby";
  if (!panel.hidden) {
    panel.innerHTML = `
      <div class="eyebrow">YOUR SECRET ROLE</div>
      <h2>${esc(room.me.roleName)}</h2>
      <p>${esc(room.me.description)}</p>
      ${!room.me.alive ? '<span class="badge bad">คุณออกจากเกมแล้ว ใช้แชทผู้ตายได้</span>' : ""}
      ${room.me.clue ? `
        <div class="clue">
          <small>คืน ${room.me.clue.round} · ${esc(room.me.clue.type)}</small>
          <strong>${esc(room.me.clue.text)}</strong>
          <small>เลือกเปิดเผยหรือเก็บไว้ เพื่อประกอบการสนทนา</small>
        </div>
      ` : ""}
    `;
  }

  $("#notesPanel").hidden = !room.me.notes.length;
  $("#notes").innerHTML = room.me.notes.map(note => `<li>${esc(note)}</li>`).join("");
}

function targetOptions(players) {
  return players.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
}

function renderAction() {
  const panel = $("#actionPanel");
  const key = JSON.stringify({
    id: room.id,
    phase: room.phase,
    round: room.round,
    role: room.me.role,
    alive: room.me.alive,
    acted: room.me.acted,
    voted: room.me.voted,
    knightUsed: room.me.knightUsed,
    policeUsed: room.me.policeUsed,
    priestUsed: room.me.priestUsed,
    lastHeal: room.me.lastHeal,
    players: room.players.map(p => [p.id, p.alive])
  });

  if (key === actionKey) return;
  actionKey = key;

  panel.hidden = true;
  panel.innerHTML = "";

  if (!room.me.alive || ["lobby", "ended"].includes(room.phase)) return;

  const alive = room.players.filter(p => p.alive);
  const dead = room.players.filter(p => !p.alive);

  function showWaiting(text) {
    panel.hidden = false;
    panel.innerHTML = `<h3>รอช่วงถัดไป</h3><p class="muted">${esc(text)}</p>`;
  }

  function showTargetAction(title, targets, help) {
    panel.hidden = false;
    panel.innerHTML = `
      <h3>${esc(title)}</h3>
      <div class="stack">
        ${targets.length ? `<select id="actionTarget">${targetOptions(targets)}</select>` : '<p class="muted">ยังไม่มีเป้าหมายที่เลือกได้</p>'}
        <button id="submitAction" ${targets.length ? "" : "disabled"}>ยืนยัน — เปลี่ยนไม่ได้</button>
        <small>${esc(help)}</small>
      </div>
    `;
    $("#submitAction").onclick = () => attempt(() => emit("action", { target: $("#actionTarget").value }));
  }

  if (room.phase === "day") {
    panel.hidden = false;
    panel.innerHTML = `
      <h3>ช่วงสนทนา</h3>
      <p class="muted">แลกเปลี่ยนเบาะแส ตั้งคำถาม และสังเกตคำตอบ ระวังตัวตลกที่อาจพยายามทำให้ตัวเองถูกโหวต</p>
    `;
    return;
  }

  if (room.phase === "vote") {
    panel.hidden = false;
    if (room.me.voted) {
      panel.innerHTML = '<h3 class="good">บันทึกคะแนนของคุณแล้ว</h3>';
      return;
    }
    panel.innerHTML = `
      <h3>ลงคะแนนผู้ต้องสงสัย</h3>
      <div class="stack">
        <select id="voteTarget">
          <option value="skip">งดออกเสียง</option>
          ${targetOptions(alive)}
        </select>
        <button id="submitVote">ยืนยันคะแนน — เปลี่ยนไม่ได้</button>
      </div>
    `;
    $("#submitVote").onclick = () => attempt(() => emit("vote", { target: $("#voteTarget").value }));
    return;
  }

  if (room.me.acted) {
    panel.hidden = false;
    panel.innerHTML = '<h3 class="good">ยืนยันการกระทำแล้ว รอรุ่งเช้า</h3>';
    return;
  }

  const role = room.me.role;
  if (role === "cupid" && room.round === 1) {
    panel.hidden = false;
    panel.innerHTML = `
      <h3>ผูกคู่รักสองคน</h3>
      <p class="muted">เลือกตัวเองได้ เมื่อคนหนึ่งออกจากเกม อีกคนจะออกตาม</p>
      <div class="stack">
        <select id="loverOne">${targetOptions(alive)}</select>
        <select id="loverTwo">${targetOptions(alive)}</select>
        <button id="submitAction">ยืนยันคู่รัก</button>
      </div>
    `;
    if (alive.length > 1) $("#loverTwo").selectedIndex = 1;
    $("#submitAction").onclick = () => attempt(() => emit("action", { targets: [$("#loverOne").value, $("#loverTwo").value] }));
    return;
  }

  if (role === "priest") {
    if (room.me.priestUsed) {
      showWaiting("คุณใช้การคืนชีพไปแล้ว");
      return;
    }
    showTargetAction("เลือกผู้เล่นที่ต้องการคืนชีพ", dead, "ใช้ได้ 1 ครั้ง หากยังไม่ต้องการใช้ ให้รอจนหมดเวลา");
    return;
  }

  if (role === "police") {
    if (room.me.policeUsed) {
      showWaiting("คุณใช้ความสามารถตำรวจไปแล้ว");
      return;
    }
    showTargetAction("เลือกเป้าหมายของตำรวจ", alive.filter(p => p.id !== me.id), "ใช้ได้ 1 ครั้ง หากเป้าหมายไม่ใช่ฝ่ายหมาป่า คุณจะออกจากเกมด้วย");
    return;
  }

  if (room.me.faction === "wolf") {
    const targets = role === "loneWolf" ? alive.filter(p => p.id !== me.id) : alive.filter(p => p.faction !== "wolf");
    const help = role === "loneWolf" ? "คุณไม่รู้ว่าใครเป็นพวกเดียวกัน จึงอาจเลือกโดนฝ่ายหมาป่าได้" : role === "alpha" ? "คะแนนของคุณมีน้ำหนัก 2 คะแนนในตอนกลางคืน" : "ปรึกษาฝูงในแชทหมาป่าก่อนยืนยันเป้าหมาย";
    showTargetAction("ลงคะแนนเลือกเป้าหมายของฝูง", targets, help);
    return;
  }

  if (role === "doctor") {
    showTargetAction("เลือกผู้เล่นที่ต้องการปกป้อง", alive.filter(p => p.id !== room.me.lastHeal), "เลือกตัวเองได้ แต่เลือกคนเดิมติดกันไม่ได้");
    return;
  }
  if (role === "seer") {
    showTargetAction("เลือกผู้เล่นที่ต้องการตรวจ", alive.filter(p => p.id !== me.id), "ผลตรวจจะแสดงในบันทึกลับเมื่อจบคืน ลูกครึ่งจะให้ผลว่าไม่ใช่หมาป่า");
    return;
  }
  if (role === "knight") {
    if (room.me.knightUsed) {
      showWaiting("คุณใช้พลังอัศวินสำเร็จไปแล้ว");
      return;
    }
    showTargetAction("เลือกผู้เล่นที่ต้องการปกป้อง", alive, "พลังจะหมดเมื่อปกป้องสำเร็จ");
    return;
  }
  if (role === "jester") {
    showWaiting("เป้าหมายของคุณคือถูกโหวตออกโดยตรงในช่วงกลางวัน");
    return;
  }

  showWaiting("คืนนี้ไม่มีความสามารถที่ต้องเลือกเป้าหมาย");
}

function renderResult() {
  const panel = $("#resultPanel");
  panel.hidden = room.phase !== "ended";
  if (panel.hidden) return;

  panel.innerHTML = `
    <h2>${esc(room.winner)}</h2>
    <p class="muted">เปิดเผยบทบาททั้งหมดแล้ว ดูได้จากรายชื่อผู้เล่น</p>
    <details>
      <summary>เฉลยประโยคเบาะแสแต่ละคืน</summary>
      ${room.clueHistory.map(c => `<p style="margin-top:12px"><b>คืน ${c.round}</b><br>${esc(c.sentence)}</p>`).join("")}
    </details>
    ${room.hostId === me.id ? '<button id="resetGame" style="margin-top:16px">กลับห้องรอ / เล่นอีกครั้ง</button>' : '<p class="muted" style="margin-top:16px">รอเจ้าของห้องเปิดรอบใหม่</p>'}
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
  $("#chatInput").placeholder = canWrite ? "พิมพ์ข้อความ..." : "ช่องนี้อ่านได้อย่างเดียวในขณะนี้";
  $("#chatStatus").textContent = canWrite ? "ข้อความยาวได้ไม่เกิน 300 ตัวอักษร" : "สิทธิ์การส่งข้อความขึ้นอยู่กับช่วงเกมและสถานะผู้เล่น";

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
  `).join("") || '<small class="muted">ยังไม่มีข้อความในช่องนี้</small>';

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
    $("#countdown").textContent = room?.phase === "lobby" ? "เตรียมพร้อม" : "—";
    return;
  }
  const seconds = Math.max(0, Math.ceil((room.endsAt - Date.now()) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remaining = String(seconds % 60).padStart(2, "0");
  $("#countdown").textContent = `${minutes}:${remaining}`;
}

setInterval(tick, 250);

async function boot() {
  renderAccount();
  try {
    const result = await api("me");
    me = result.user;
    renderAccount();
    showPage("homePage");
    connect();
  } catch {
    showPage("authPage");
  }
}

boot();
