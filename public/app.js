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
  owner: "มาดาม",
  psycho: "คนป่วยจิต",
  spyWolf: "หมาป่าสายลับ",
  cosplayer: "นักคอสเพลย์",
  hunter: "นายพราน",
  witchDoctor: "หมอผี",
  thief: "โจร",
  transformer: "ทรานส์ฟอร์มเมอร์",
  godzilla: "ก็อตซิลล่า",
  lizard: "กิ่งก่า"
};

// บทบาทที่ต้องรู้ตัวเองก่อนถึงจะใช้ความสามารถได้ ใช้ในโหมดไม่รู้จักตัวเองไม่ได้ (ต้องตรงกับ server.js)
const BLIND_BLOCKED = ["cupid", "priest", "godzilla", "lizard"];

// หมวดบทบาทสำหรับหน้าสร้างห้องและตั้งค่าห้อง
const ROLE_GROUPS = [
  {
    title: "ฝ่ายชาวบ้าน",
    roles: [
      ["sheriff", "นายอำเภอ: คะแนนโหวตนับเป็น 2 คะแนน"],
      ["doctor", "หมอ: ช่วยคนไม่ให้ตาย"],
      ["seer", "ผู้หยั่งรู้: ทำนายบทบาท"],
      ["cupid", "ผู้ผูกคู่รัก: คำให้คนรักกัน"],
      ["knight", "อัศวิน: กันภัยให้คนอื่น 1 ครั้ง"],
      ["police", "ตำรวจ: จัดการคน 1 ครั้ง"],
      ["priest", "นักบวช: ชุบชีวิตคน 1 ครั้ง"],
      ["pet", "สัตว์เลี้ยงกับมาดาม: รู้ว่าใครฆ่าอีกฝ่าย"],
      ["hunter", "นายพราน: กันภัยให้คนอื่น และกำจัดหมาป่าที่มาคุกคาม"],
      ["thief", "โจร: ขโมยคะแนนโหวตของคนอื่น"],
      ["cosplayer", "นักคอสเพลย์: หมาป่าเห็นเป็นพวก"]
    ]
  },
  {
    title: "ฝ่ายหมาป่าพิเศษ",
    roles: [
      ["loneWolf", "หมาป่าเดียวดาย: ไม่รู้จักเพื่อนฝูง"],
      ["hybrid", "ลูกครึ่ง: ผู้หยั่งรู้จะเห็นเป็นชาวบ้าน"],
      ["alpha", "จ่าฝูง: คะแนนโหวตนับเป็น 2 คะแนน"],
      ["spyWolf", "หมาป่าสายลับ: รู้รหัสลับของชาวบ้าน"],
      ["transformer", "ทรานส์ฟอร์มเมอร์: ถ้าถูกโหวตออก ฝั่งชาวบ้านจะใช้ความสามารถไม่ได้อีก"],
      ["lizard", "กิ่งก่า: เลียนแบบบทบาท ผู้หยั่งรู้จะเห็นเป็นบทบาทที่เลียนแบบ"]
    ]
  },
  {
    title: "ฝ่ายเป็นกลาง",
    roles: [
      ["jester", "ตัวตลก: ถูกโหวตออกคือชนะ"],
      ["psycho", "คนป่วยจิต: ถูกฆ่าตอนกลางคืนคือชนะ"],
      ["witchDoctor", "หมอผี: ถูกหมาป่าฆ่าแล้ว จะกลายเป็นหมาป่า"],
      ["godzilla", "ก็อตซิลล่า: กำจัดคนตอนเช้า (วันที่ 2+) ชนะเมื่อเหลือรอดคนเดียว"]
    ]
  }
];

function roleCheckboxes(selected, blind = false) {
  return ROLE_GROUPS.map(group => `
    <h3>${esc(group.title)}</h3>
    <div class="roles-grid">
      ${group.roles.map(([value, label]) => {
        const off = blind && BLIND_BLOCKED.includes(value);
        return `
        <label class="check-row">
          <input type="checkbox" name="role" value="${value}" ${selected[value] && !off ? "checked" : ""} ${off ? "disabled" : ""}> ${esc(label)}${off ? " (ใช้ในโหมดไม่รู้จักตัวเองไม่ได้)" : ""}
        </label>`;
      }).join("")}
    </div>
  `).join("");
}

function modeSelect(blind) {
  return `
    <label>โหมดเกม
      <select name="mode">
        <option value="normal" ${blind ? "" : "selected"}>ธรรมดา</option>
        <option value="blind" ${blind ? "selected" : ""}>ไม่รู้จักตัวเอง (ทุกคนไม่รู้บทบาทของตัวเอง)</option>
      </select>
    </label>`;
}

const CHANNEL_NAMES = {
  public: "ทุกคน",
  wolves: "หมาป่า",
  lovers: "คู่รัก",
  dead: "ผู้ตาย",
  notes: "โน้ต"
};

// รูปบทบาทอยู่ที่ /img/roles/<รหัสบทบาท>.webp (unknown = ยังไม่เปิดเผย)
// บทบาทที่ยังไม่มีรูปใน imageRole ใช้ไอคอนแทนไปก่อน
const ROLE_NO_IMAGE = { seer: "🔮", hybrid: "🌗", witchDoctor: "🧪" };

function roleImg(role) {
  const key = role && Object.hasOwn(ROLE_NAMES, role) ? role : "unknown";
  if (ROLE_NO_IMAGE[key]) return `<div class="ph">${ROLE_NO_IMAGE[key]}</div>`;
  return `<img${key === "unknown" ? ' class="unk"' : ""} src="/img/roles/${key}.webp" alt="" draggable="false">`;
}

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
let photoDraft; // undefined = ไม่เปลี่ยน, null = ลบรูป, string = รูปใหม่ (data URL)
let createBlind = false;
let createRolesState = { doctor: true, seer: true };
let dayPick = null;
let dayKey = "";
let notesSeen = 0;
let seenChatCount = 0;
let lastMode = "";

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

// รูปโปรไฟล์ (ถ้ามี) หรือตัวอักษรอวตาร
function avatarInner(user) {
  return user.photo
    ? `<img src="/photo/${esc(user.id)}?v=${Number(user.photo)}" alt="">`
    : esc(user.avatar);
}

function toast(text) {
  $("#toast").textContent = text;
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").hidden = true, 3500);
}

function showPage(id) {
  currentPage = id;
  document.body.classList.toggle("in-room", id === "roomPage");
  for (const page of PAGES) {
    $("#" + page).hidden = page !== id;
  }
  if (id === "avatarPage" && me) {
    selectedAvatar = me.avatar;
    selectedColor = me.color;
    $("#nameInput").value = me.name;
    photoDraft = undefined;
    renderAvatar();
  }
  if (id === "browsePage") renderRooms();
  if (id === "createPage") showCreateStep("mode");
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
const PHOTO_KEY = "ww_photo" + TOKEN_SUFFIX;
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

function loadPhoto() {
  try {
    return localStorage.getItem(PHOTO_KEY) || "";
  } catch {
    return "";
  }
}

function storePhoto(value) {
  try {
    if (value) localStorage.setItem(PHOTO_KEY, value);
    else localStorage.removeItem(PHOTO_KEY);
  } catch {}
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
      <span class="avatar small" style="--avatar-color:${esc(me.color)}">${avatarInner(me)}</span>
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
          <div class="avatar" style="--avatar-color:${esc(p.color)}">${avatarInner(p)}</div>
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
  socket = io({ auth: cb => cb({ token, ...loadProfile(), photo: loadPhoto() || undefined }) });

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
  socket.on("notice", text => toast(text));
  socket.on("state", data => {
    const changedRoom = room?.id !== data?.id;
    room = data;
    if (!room) {
      actionKey = "";
      lastMessagesKey = "";
      lastMode = "";
      $("#roomBody").classList.remove("chat-open");
      $("#settingsPanel").classList.remove("open");
      clearAnnounce();
      if (["roomPage", "loadingPage"].includes(currentPage)) showPage("homePage");
      return;
    }
    if (changedRoom) {
      channel = "public";
      actionKey = "";
      lastMessagesKey = "";
      notesSeen = 0;
      seenChatCount = 0;
    }
    const self = room.players.find(p => p.id === me.id);
    if (self) {
      me.name = self.name;
      me.avatar = self.avatar;
      me.color = self.color;
      me.photo = self.photo;
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
    blind: createBlind,
    roles
  }));
};

function showCreateStep(step) {
  $("#modePicker").hidden = step !== "mode";
  $("#createForm").hidden = step !== "form";
}

function renderCreateRoles() {
  if ($("#createRoles").children.length) {
    createRolesState = {};
    new FormData($("#createForm")).getAll("role").forEach(role => createRolesState[role] = true);
  }
  $("#createRoles").innerHTML = roleCheckboxes(createRolesState, createBlind);
  $("#modeBadge").textContent = "โหมด: " + (createBlind ? "ไม่รู้จักตัวเอง" : "ธรรมดา");
}

$$("[data-mode]").forEach(button => {
  button.onclick = () => {
    createBlind = button.dataset.mode === "blind";
    renderCreateRoles();
    showCreateStep("form");
  };
});
$("#changeMode").onclick = () => showCreateStep("mode");

function renderAvatar() {
  const preview = $("#avatarPreview");
  if (typeof photoDraft === "string") preview.innerHTML = `<img src="${photoDraft}" alt="">`;
  else if (photoDraft === undefined && me?.photo) preview.innerHTML = avatarInner(me);
  else preview.textContent = selectedAvatar;
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
      photoDraft = null; // เลือกตัวอักษรแทนรูป
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

// ปุ่มบันทึกปุ่มเดียว บันทึกทั้งชื่อ ตัวละคร และสี
$("#profileForm").onsubmit = event => {
  event.preventDefault();
  attempt(async () => {
    const result = await emit("profile", {
      name: $("#nameInput").value,
      avatar: selectedAvatar,
      color: selectedColor,
      photo: photoDraft
    });
    if (typeof photoDraft === "string") storePhoto(photoDraft);
    else if (photoDraft === null) storePhoto("");
    photoDraft = undefined;
    me = result.user;
    renderAccount();
    renderAvatar();
    toast("บันทึกแล้ว");
  });
};

// สุ่มชื่อลงในช่องเท่านั้น ยังไม่บันทึกจนกว่าจะกดบันทึก
$("#randomName").onclick = () => attempt(async () => {
  const result = await emit("suggestName");
  $("#nameInput").value = result.name;
});

// ย่อรูปเป็นสี่เหลี่ยมจัตุรัส 128px แล้วแปลงเป็น JPEG ก่อนอัปโหลด
async function resizeImage(file) {
  if (!file.type.startsWith("image/")) throw new Error("กรุณาเลือกไฟล์รูปภาพ");
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("เปิดรูปนี้ไม่ได้ ลองรูป JPG หรือ PNG");
  }
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size, size);
  const side = Math.min(bitmap.width, bitmap.height);
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close?.();
  let quality = 0.85;
  let url;
  do {
    url = canvas.toDataURL("image/jpeg", quality);
    quality -= 0.1;
  } while (url.length > 20000 && quality > 0.3);
  if (url.length > 20000) throw new Error("รูปใหญ่เกินไป ลองรูปอื่น");
  return url;
}

$("#photoPick").onclick = () => $("#photoInput").click();
$("#photoInput").onchange = event => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  attempt(async () => {
    photoDraft = await resizeImage(file);
    renderAvatar();
  });
};
$("#photoClear").onclick = () => {
  photoDraft = null;
  renderAvatar();
};

$("#copyCode").onclick = () => attempt(async () => {
  if (!navigator.clipboard) {
    toast(`เลขห้อง: ${room.id}`);
    return;
  }
  await navigator.clipboard.writeText(room.id);
  toast("คัดลอกเลขห้องแล้ว");
});

function leave() {
  return attempt(async () => {
    if (room && !["lobby", "ended"].includes(room.phase)) {
      if (!confirm("ออกจากเกมเลยไหม? ออกแล้วกลับมาเล่นรอบนี้ไม่ได้")) return;
    }
    await emit("leave");
  });
}
$$(".js-leave").forEach(button => { button.onclick = leave; });

$("#readyButton").onclick = () => attempt(() => emit("ready"));
$("#startButton").onclick = () => attempt(() => emit("start"));
$("#rolePanel").onclick = () => $("#rolePanel").classList.toggle("expanded");

// แชทบนมือถือตอนเล่นเกมเป็นแผ่นเลื่อนขึ้นมา
$("#chatToggle").onclick = () => {
  $("#roomBody").classList.add("chat-open");
  renderRoom();
  const box = $("#messages");
  box.scrollTop = box.scrollHeight;
};
$("#chatClose").onclick = () => {
  $("#roomBody").classList.remove("chat-open");
  renderRoom();
};
$("#settingsEdit").onclick = () => $("#settingsPanel").classList.add("open");
$("#settingsClose").onclick = () => $("#settingsPanel").classList.remove("open");
document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  $("#settingsPanel").classList.remove("open");
  if ($("#roomBody").classList.contains("chat-open")) $("#chatClose").click();
});

function renderRoom() {
  const lobby = room.phase === "lobby";
  const body = $("#roomBody");
  body.dataset.mode = lobby ? "lobby" : "game";
  if (lobby) body.classList.remove("chat-open");

  // แชทอยู่คอลัมน์ซ้ายตอนรอผู้เล่น และคอลัมน์ขวาตอนเล่นเกม
  const chatHome = lobby ? $("#colA") : $("#colC");
  if ($("#chatPanel").parentElement !== chatHome) chatHome.appendChild($("#chatPanel"));
  if (lastMode !== body.dataset.mode) {
    lastMode = body.dataset.mode;
    lastMessagesKey = "";
  }

  $("#roomTitle").textContent = room.title;
  $("#roomCode").textContent = "เลขห้อง " + room.id;
  $("#roomVisibility").textContent = room.settings.visibility === "private" ? "ส่วนตัว" : "สาธารณะ";
  $("#phaseLabel").textContent = room.phaseName + (room.round && room.phase !== "lobby" ? ` · ${room.phase === "night" ? "คืน" : "วัน"}ที่ ${room.round}` : "");
  $("#playerCount").textContent = `${room.players.length} / ${room.settings.capacity ?? "∞"} คน`;

  $$(".js-leave").forEach(button => {
    button.disabled = false;
    button.title = ["lobby", "ended"].includes(room.phase) ? "ออกจากห้อง" : "ออกจากเกม";
  });

  renderLobby();
  renderSettings();
  renderPlayers();
  renderRole();
  renderAction();
  renderResult();
  renderChat();

  // ป้ายข้อความใหม่บนปุ่มแชท (มือถือ)
  const chatCount = room.messages.filter(m => m.senderId).length;
  if (lobby || body.classList.contains("chat-open") || chatCount < seenChatCount) seenChatCount = chatCount;
  const unread = chatCount - seenChatCount;
  $("#chatToggle").textContent = unread > 0 ? `💬 แชท (${unread})` : "💬 แชท";
  tick();
}

function renderLobby() {
  if (room.phase !== "lobby") return;

  const plan = room.plan;
  const s = room.settings;
  const isHost = room.hostId === me.id;
  const notReady = room.players.filter(p => !p.ready).length;
  const offline = room.players.filter(p => !p.online).length;
  const canStart = room.players.length >= 4 && !notReady && !offline;

  $("#readyButton").textContent = room.me.ready ? "ยกเลิกพร้อม" : "พร้อม";
  $("#readyButton").className = room.me.ready ? "secondary" : "success";
  $("#startButton").hidden = !isHost;
  $("#startButton").disabled = !canStart;

  $("#lobbyInfo").innerHTML = `
    <span class="badge">หมาป่า ${plan.wolves} คน (${s.wolfPercent}%)</span>
    <span class="badge">ชาวบ้านธรรมดา ${plan.villagers} คน</span>
    <span class="badge">ฝ่ายเป็นกลาง ${plan.neutrals.length} คน</span>
    ${s.blind ? '<span class="badge">โหมดไม่รู้จักตัวเอง</span>' : ""}
    <small>กลางคืน ${s.nightSeconds}s · คุย ${s.daySeconds}s · โหวต ${s.voteSeconds}s</small>
  `;

  const need = $("#lobbyNeed");
  if (room.players.length < 4) {
    need.className = "bad";
    need.textContent = "ต้องมีอย่างน้อย 4 คน";
  } else if (offline) {
    need.className = "bad";
    need.textContent = `ออฟไลน์ ${offline} คน`;
  } else if (!isHost) {
    need.className = "muted";
    need.textContent = "รอเจ้าของห้องกดเริ่ม";
  } else {
    need.className = canStart ? "good" : "muted";
    need.textContent = canStart ? "ทุกคนพร้อมแล้ว เริ่มเกมได้เลย" : "";
  }
  $("#lobbyNotReady").textContent = notReady ? `ยังไม่พร้อม ${notReady} คน` : "";
}

let settingsKey = "";

function settingsSummaryHtml(s) {
  const names = ROLE_GROUPS.flatMap(group => group.roles)
    .filter(([value]) => s.roles[value] && !(s.blind && BLIND_BLOCKED.includes(value)))
    .map(([value]) => value === "pet" ? "สัตว์เลี้ยง + มาดาม" : ROLE_NAMES[value]);
  return `
    <p>โหมด: <b>${s.blind ? "ไม่รู้จักตัวเอง" : "ธรรมดา"}</b> · ${s.visibility === "private" ? "ส่วนตัว" : "สาธารณะ"}</p>
    <p>ผู้เล่นสูงสุด ${s.capacity ?? "ไม่จำกัด"} · หมาป่า ${s.wolfPercent}%</p>
    <p>กลางคืน ${s.nightSeconds}s · คุย ${s.daySeconds}s · โหวต ${s.voteSeconds}s</p>
    <p style="margin:0">บทบาทที่เปิด:</p>
    <div class="chips">${names.length ? names.map(n => `<span class="badge">${esc(n)}</span>`).join("") : '<small>ไม่มีบทบาทพิเศษ</small>'}</div>
  `;
}

function renderSettings() {
  const panel = $("#settingsPanel");
  if (room.phase !== "lobby") {
    settingsKey = "";
    panel.classList.remove("open", "is-host");
    return;
  }

  const isHost = room.hostId === me.id;
  panel.classList.toggle("is-host", isHost);
  if (!isHost) panel.classList.remove("open");

  // สร้างฟอร์มใหม่เฉพาะเมื่อค่าตั้งค่าเปลี่ยน เพื่อไม่ให้ที่กำลังพิมพ์อยู่หาย
  const key = JSON.stringify([room.id, room.title, room.settings, isHost]);
  if (key === settingsKey) return;
  settingsKey = key;

  const s = room.settings;
  $("#settingsSummary").innerHTML = settingsSummaryHtml(s);
  if (!isHost) {
    $("#settingsBody").innerHTML = "";
    return;
  }

  $("#settingsBody").innerHTML = `
    <form id="settingsForm">
      <div class="grid2">
        <label>ชื่อห้อง<input name="title" maxlength="50" value="${esc(room.title)}" required></label>
        <label>ผู้เล่นสูงสุด
          <input name="capacity" type="number" min="4" step="1" value="${s.capacity ?? ""}" placeholder="ไม่จำกัด">
        </label>
        <label>สถานะห้อง
          <select name="visibility">
            <option value="private" ${s.visibility === "private" ? "selected" : ""}>ส่วนตัว</option>
            <option value="public" ${s.visibility === "public" ? "selected" : ""}>สาธารณะ</option>
          </select>
        </label>
        <label>หมาป่ากี่ %
          <input name="wolfPercent" type="number" min="1" max="49" value="${s.wolfPercent}" required>
        </label>
      </div>
      ${modeSelect(s.blind)}
      <div class="grid3">
        <label>กลางคืน (วิ)<input name="nightSeconds" type="number" min="15" max="600" value="${s.nightSeconds}" required></label>
        <label>คุย (วิ)<input name="daySeconds" type="number" min="15" max="600" value="${s.daySeconds}" required></label>
        <label>โหวต (วิ)<input name="voteSeconds" type="number" min="15" max="600" value="${s.voteSeconds}" required></label>
      </div>
      ${roleCheckboxes(s.roles, s.blind)}
      <small>เลือกเกินจำนวนคนได้ ตอนเริ่มจะสุ่มให้พอดี</small>
      <button>บันทึก</button>
    </form>
  `;

  $("#settingsBody").querySelector('[name="mode"]').onchange = event => {
    const blind = event.target.value === "blind";
    $("#settingsBody").querySelectorAll('input[name="role"]').forEach(input => {
      if (!BLIND_BLOCKED.includes(input.value)) return;
      input.disabled = blind;
      if (blind) input.checked = false;
    });
  };

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
        blind: form.get("mode") === "blind",
        roles
      });
      panel.classList.remove("open");
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
      help: "แตะการ์ดผู้เล่นเพื่อโหวตทันที แตะซ้ำเพื่อยกเลิก เปลี่ยนได้จนกว่าจะหมดเวลา ตัวเลขบนการ์ดคือคะแนนที่คนนั้นได้ตอนนี้",
      targets: ids(alive),
      choice: m.vote,
      counts: room.tally || {},
      skipCount: room.skipCount || 0,
      progress: room.progress
    };
  }
  // ความสามารถตอนกลางวัน: ก็อตซิลล่า (วันที่ 2+) กำจัดคน / กิ่งก่าเลียนแบบบทบาท เลือกการ์ดแล้วกดยืนยัน
  if (room.phase === "day") {
    if (m.dayUsed || !["godzilla", "lizard"].includes(m.role)) return null;
    if (m.role === "godzilla" && room.round < 2) return null;
    const key = room.id + ":" + room.round;
    if (key !== dayKey) {
      dayKey = key;
      dayPick = null;
    }
    const smash = m.role === "godzilla";
    return {
      type: "day",
      title: smash ? "กำจัดผู้เล่น 1 คน" : "เลียนแบบบทบาท",
      help: smash
        ? "แตะการ์ดแล้วกดยืนยัน ใช้ได้วันละ 1 ครั้ง คนที่ถูกกำจัดจะออกจากเกมทันที"
        : "แตะการ์ดแล้วกดยืนยัน ผู้หยั่งรู้จะเห็นคุณเป็นบทบาทของคนนั้น เลียนแบบได้วันละ 1 ครั้ง",
      confirm: smash ? "ยืนยันกำจัด" : "ยืนยันเลียนแบบ",
      targets: ids(alive.filter(p => p.id !== me.id)),
      choice: dayPick,
      counts: null
    };
  }
  if (room.phase !== "night") return null;
  if (m.sealed) return null;

  const role = m.role;
  const base = (title, help, list, counts = null) => ({
    type: "action", title, help, targets: ids(list), choice: m.choice, counts
  });

  // โหมดไม่รู้บทบาท: ทุกคนเลือกเป้าหมายได้ทุกคืน ถ้าบทบาทไม่มีผลก็ไม่เกิดอะไรขึ้น
  if (role === "unknown") {
    return base("เลือกเป้าหมายคืนนี้", "คุณไม่รู้บทบาทของตัวเอง ลองเลือกใครสักคน ถ้าบทบาทของคุณไม่มีผลก็จะไม่เกิดอะไรขึ้น ข้ามได้", alive);
  }

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
    return m.policeUsed ? null : base("เลือกคนที่จะจัดการ", "ใช้ได้ครั้งเดียว ถ้าเลือกฝ่ายชาวบ้าน คุณจะออกจากเกมด้วย (หมาป่าและฝ่ายเป็นกลางไม่เป็นไร ข้ามได้ ไม่เสียสิทธิ์)", alive.filter(p => p.id !== me.id));
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
  if (role === "seer") return base("เลือกคนที่จะตรวจ", "ผลจะแสดงบทบาทของคนนั้นในโน้ตลับตอนจบคืน (ลูกครึ่งจะแสดงเป็นชาวบ้าน)", alive.filter(p => p.id !== me.id));
  if (role === "hunter") return base("เลือกคนที่จะคุ้มครอง", "ถ้าคนนั้นถูกหมาป่าฆ่า เขาจะไม่ตาย และหมาป่าที่ลงมือจะตายแทน (สุ่ม 1 ตัว)", alive.filter(p => p.id !== me.id));
  if (role === "thief") return base("เลือกคนที่จะขโมยโหวต", "โหวตของคนนั้นในวันถัดไปจะไม่นับ และโหวตของคุณเพิ่มขึ้น 1", alive.filter(p => p.id !== me.id));
  if (role === "knight") return m.knightUsed ? null : base("เลือกคนที่จะปกป้อง", "ปกป้องสำเร็จแล้วพลังจะหมด", alive);
  return null;
}

function pickTarget(id) {
  const I = interaction();
  if (!I || !I.targets.has(id)) return;

  if (I.type === "day") {
    dayPick = dayPick === id ? null : id;
    renderPlayers();
    renderAction();
    return;
  }

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
  const kickButton = event.target.closest("[data-kick]");
  if (kickButton) {
    event.stopPropagation();
    const target = room?.players.find(p => p.id === kickButton.dataset.kick);
    if (target && confirm(`เตะ ${target.name} ออกจากห้อง? เตะแล้วเข้ามาใหม่ไม่ได้`)) {
      attempt(() => emit("kick", { id: target.id }));
    }
    return;
  }
  const cardEl = event.target.closest("[data-pid]");
  if (cardEl) pickTarget(cardEl.dataset.pid);
};
$("#players").onkeydown = event => {
  if (event.key !== "Enter" && event.key !== " ") return;
  if (event.target.closest("[data-kick]")) return;
  const cardEl = event.target.closest("[data-pid]");
  if (cardEl) {
    event.preventDefault();
    pickTarget(cardEl.dataset.pid);
  }
};

function renderPlayers() {
  const I = interaction();
  const lobby = room.phase === "lobby";
  $("#players").dataset.count = room.players.length;
  $("#players").innerHTML = room.players.map(player => {
    const selectable = Boolean(I && I.targets.has(player.id));
    const selected = I ? (I.type === "pair" ? pairPick.includes(player.id) : I.choice === player.id) : false;
    const canKick = room.hostId === me.id && player.id !== me.id && !player.left && room.phase !== "ended";
    const count = I?.counts?.[player.id] || 0;

    const classes = `player ${lobby ? "lobby" : ""} ${player.alive ? "" : "out"} ${player.id === me.id ? "self" : ""} ${selectable ? "selectable" : ""} ${selected ? "selected" : ""}`;
    const attrs = `data-pid="${esc(player.id)}" ${selectable ? 'role="button" tabindex="0"' : ""}`;
    const tags = [
      player.id === room.hostId ? '<span class="badge" title="เจ้าของห้อง">👑</span>' : "",
      player.id === me.id ? '<span class="badge">คุณ</span>' : "",
      player.lover ? '<span class="badge" title="คู่รัก">💕</span>' : "",
      player.bonded ? '<span class="badge" title="คู่หู">🔗</span>' : ""
    ].join("");
    const dot = `<i class="dot ${player.online ? "" : "off"}" title="${player.online ? "ออนไลน์" : "ออฟไลน์"}"></i>`;
    const kick = canKick
      ? `<button type="button" class="danger kick-button" data-kick="${esc(player.id)}" title="เตะออก" aria-label="เตะ ${esc(player.name)} ออก">✕</button>`
      : "";
    const avatar = `<div class="avatar ${lobby ? "" : "p-avatar"}" style="--avatar-color:${esc(player.color)}">${avatarInner(player)}</div>`;

    if (lobby) {
      return `
      <div class="${classes}" ${attrs}>
        <div class="p-tags">${tags}</div>
        ${kick}
        ${avatar}
        <div class="p-info">
          <div class="p-name">${esc(player.name)}</div>
          <span class="p-sub ${player.ready ? "good" : ""}">${dot}${player.ready ? "พร้อมแล้ว" : "ยังไม่พร้อม"}</span>
        </div>
      </div>`;
    }

    const status = player.left ? "ออกจากห้องแล้ว" : player.alive ? "ยังอยู่" : "ออกแล้ว";
    let sub = player.roleName ? (player.alive ? player.roleName : `${status} · ${player.roleName}`) : status;
    if (selected) sub = I.type === "vote" ? "✓ คุณโหวตคนนี้" : "✓ ที่คุณเลือก";
    return `
    <div class="${classes}" ${attrs}>
      <div class="p-art">
        ${roleImg(player.role)}
        <div class="p-tags">${tags}</div>
        ${count ? `<span class="count-badge" title="จำนวนคะแนน">${count}</span>` : ""}
        ${avatar}
        ${kick}
      </div>
      <div class="p-info">
        <div class="p-name">${dot}${esc(player.name)}</div>
        <span class="p-sub ${selected ? "good" : ""}">${esc(sub)}</span>
      </div>
    </div>`;
  }).join("");
}

function renderRole() {
  if (room.phase === "lobby") return;

  const panel = $("#rolePanel");
  panel.innerHTML = `
    <div class="eyebrow">บทบาทของคุณ</div>
    <h2>${esc(room.me.roleName)}</h2>
    <p class="role-desc">${esc(room.me.description)}</p>
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

  const key = Object.hasOwn(ROLE_NAMES, room.me.role) ? room.me.role : "unknown";
  const art = $("#roleArtInner");
  if (art.dataset.key !== key) {
    art.dataset.key = key;
    art.innerHTML = roleImg(key);
  }
  $("#roleCap").textContent = key === "unknown" ? "ไม่ทราบบทบาท" : room.me.roleName;
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
    } else if (I.type === "day") {
      status = I.choice ? `เลือกไว้: ${nameOf(I.choice)} (ยังไม่ยืนยัน)` : "ยังไม่ได้เลือก";
    } else {
      status = I.choice === "skip" ? "ข้ามแล้ว" : I.choice ? `${I.type === "vote" ? "คุณโหวต" : "เลือกอยู่"}: ${nameOf(I.choice)}` : "ยังไม่ได้เลือก";
    }
    const progress = I.progress ? `<small>โหวตแล้ว ${I.progress.done}/${I.progress.total} คน</small>` : "";

    show(`
      <div class="action-head">
        <h3>${esc(I.title)}</h3>
        <p class="${I.choice ? "good" : "muted"}">${esc(status)}</p>
      </div>
      <div class="action-btns">
        ${I.type === "pair" ? `<button id="pairConfirm" ${pairPick.length === 2 ? "" : "disabled"}>ยืนยันคู่รัก</button>` : ""}
        ${I.type === "day" ? `<button id="dayConfirm" class="danger" ${I.choice ? "" : "disabled"}>${esc(I.confirm)}</button>` : `<button id="skipButton" class="${I.choice === "skip" ? "success" : "secondary"}">${I.choice === "skip" ? "✓ ข้ามอยู่ (แตะเพื่อยกเลิก)" : "ข้าม"}${I.type === "vote" ? ` (${I.skipCount})` : ""}</button>`}
        ${progress}
      </div>
      <small class="help">${esc(I.help)}</small>
    `);
    if ($("#skipButton")) $("#skipButton").onclick = () => submitChoice(I, I.choice === "skip" ? null : "skip");
    if (I.type === "day") {
      $("#dayConfirm").onclick = () => attempt(async () => {
        await emit("dayAbility", { target: dayPick });
        dayPick = null;
      });
    }
    if (I.type === "pair") {
      $("#pairConfirm").onclick = () => attempt(() => emit("action", { targets: pairPick }));
    }
    return;
  }

  if (room.phase === "day") {
    const dm = room.me;
    const note = dm.role === "godzilla"
      ? (dm.dayUsed ? "วันนี้คุณกำจัดคนไปแล้ว " : room.round < 2 ? "ก็อตซิลล่าเริ่มกำจัดคนได้ตั้งแต่เช้าวันที่ 2 " : "")
      : dm.role === "lizard"
        ? (dm.dayUsed ? `วันนี้เลียนแบบไปแล้ว${dm.mimicName ? ` (ตอนนี้ผู้หยั่งรู้เห็นคุณเป็น ${dm.mimicName})` : ""} ` : "")
        : "";
    show(`
      <div class="action-head"><h3>ช่วงคุยกัน</h3></div>
      <p class="muted" style="margin:4px 0 0;font-size:13px;line-height:1.5">${note}${room.round === 1 ? "วันแรกยังโหวตไม่ได้ " : ""}คุยกัน ถามกัน แล้วดูว่าใครมีพิรุธ ระวังตัวตลกที่อยากโดนโหวต</p>
    `);
    return;
  }

  const m = room.me;
  let text = "คืนนี้ไม่มีอะไรให้ทำ รอตอนเช้า";
  if (m.sealed) text = "ความสามารถของฝั่งชาวบ้านถูกผนึกแล้ว เพราะทรานส์ฟอร์มเมอร์ถูกโหวตออก";
  else if (m.role === "priest") text = m.priestUsed ? "ใช้ชุบชีวิตไปแล้ว" : "ยังไม่มีผู้ออกจากเกมให้ชุบชีวิต";
  else if (m.role === "police" && m.policeUsed) text = "ใช้พลังตำรวจไปแล้ว";
  else if (m.role === "knight" && m.knightUsed) text = "ใช้พลังอัศวินไปแล้ว";
  else if (m.role === "jester") text = "เป้าหมายคือให้คนโหวตคุณออกตอนกลางวัน";
  show(`<div class="action-head"><h3>รอช่วงถัดไป</h3></div><p class="muted" style="margin:4px 0 0;font-size:13px;line-height:1.5">${esc(text)}</p>`);
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
    ${room.hostId === me.id ? '<button id="resetGame" style="margin-top:8px">เล่นอีกรอบ</button>' : '<p class="muted" style="margin:8px 0 0">รอเจ้าของห้องเริ่มรอบใหม่</p>'}
  `;

  if ($("#resetGame")) {
    $("#resetGame").onclick = () => attempt(() => emit("reset"));
  }
}

function renderChat() {
  const notes = room.phase === "lobby" ? [] : room.me.notes;
  const channels = [...room.readChannels];
  if (notes.length) channels.push("notes");
  if (!channels.includes(channel)) {
    channel = room.writeChannels[0] || "public";
  }

  if (notes.length < notesSeen) notesSeen = notes.length;
  if (channel === "notes") notesSeen = notes.length;
  const fresh = notes.length > notesSeen;

  $("#chatTabs").innerHTML = channels.length > 1 ? channels.map(item => `
    <button type="button" class="secondary ${item === channel ? "active" : ""} ${item === "notes" && fresh ? "fresh" : ""}" data-channel="${item}">
      ${CHANNEL_NAMES[item]}${item === "notes" ? ` (${notes.length})${fresh ? " •" : ""}` : ""}
    </button>
  `).join("") : "";

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
  $("#chatStatus").textContent = channel === "notes"
    ? "โน้ตลับ เห็นแค่คุณคนเดียว"
    : canWrite ? "ไม่เกิน 300 ตัวอักษร" : "ช่วงนี้ส่งข้อความในช่องนี้ไม่ได้";

  const messages = room.messages.filter(m => m.channel === channel);
  const key = channel === "notes"
    ? "notes:" + notes.join("\n")
    : channel + ":" + messages.map(m => m.id).join(",");
  if (key === lastMessagesKey) return;
  lastMessagesKey = key;

  const container = $("#messages");
  const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 70;

  if (channel === "notes") {
    container.innerHTML = notes.map(note => `<div class="message note"><p>${esc(note)}</p></div>`).join("");
  } else {
    container.innerHTML = messages.map(m => `
      <div class="message ${m.senderId ? "" : "system"}">
        <b>${esc(m.name)}</b>
        <time>${new Date(m.time).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</time>
        <p>${esc(m.text)}</p>
      </div>
    `).join("") || '<small class="muted">ยังไม่มีข้อความ</small>';
  }

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
