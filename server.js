const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 32 * 1024
});

const PORT = Number(process.env.PORT || 3000);
const PROD = process.env.NODE_ENV === "production";

app.disable("x-powered-by");
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
app.use(express.json({ limit: "8kb" }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});

const users = new Map();
const online = new Map();
const rooms = new Map();
const userRoom = new Map();

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

const ROLE_DESCRIPTIONS = {
  villager: "ได้รับคำเดียวกับชาวบ้านคนอื่น ใช้คำนี้ใบ้กันโดยไม่พูดตรง ๆ เพื่อหาคนที่ไม่รู้คำ (หมาป่า)",
  wolf: "ไม่ได้รับคำของชาวบ้าน ต้องแกล้งทำเป็นรู้ และร่วมกับฝูงเลือกเป้าหมายตอนกลางคืน",
  sheriff: "คะแนนโหวตกลางวันมีน้ำหนัก 2 คะแนน",
  doctor: "ปกป้องหนึ่งคนต่อคืน แต่เลือกคนเดิมติดกันไม่ได้",
  seer: "ตรวจหนึ่งคนต่อคืน แต่ลูกครึ่งจะให้ผลว่าไม่ใช่หมาป่า",
  cupid: "คืนแรกเลือกผู้เล่นสองคนเป็นคู่รัก รวมตัวเองได้",
  knight: "ปกป้องหนึ่งคนต่อคืน พลังหมดเมื่อช่วยสำเร็จ",
  police: "จัดการเป้าหมายได้ 1 ครั้ง หากเลือกคนที่ไม่ใช่ฝ่ายหมาป่าจะออกจากเกมด้วย",
  loneWolf: "อยู่ฝ่ายหมาป่า ไม่ได้รับคำของชาวบ้าน ไม่รู้ว่าใครเป็นพวกเดียวกัน และไม่มีแชทหมาป่า",
  hybrid: "อยู่ฝ่ายหมาป่า ไม่ได้รับคำของชาวบ้าน แต่ผู้หยั่งรู้จะตรวจคุณเป็นชาวบ้าน",
  alpha: "อยู่ฝ่ายหมาป่า ไม่ได้รับคำของชาวบ้าน คะแนนเลือกเป้าหมายกลางคืนมีน้ำหนัก 2",
  priest: "คืนชีพผู้เล่นที่ออกจากเกมได้ 1 ครั้ง",
  jester: "ไม่มีฝ่าย หากถูกโหวตออกตอนกลางวันจะชนะทันที",
  pet: "รู้จักเจ้าของ หากเจ้าของถูกจัดการ คุณจะรู้ข้อมูลผู้ลงมือ",
  owner: "รู้จักสัตว์เลี้ยง หากสัตว์เลี้ยงถูกจัดการ คุณจะรู้ข้อมูลผู้ลงมือ"
};

const WOLF_ROLES = new Set(["wolf", "loneWolf", "hybrid", "alpha"]);
const SPECIAL_WOLF_ROLES = ["loneWolf", "hybrid", "alpha"];
const VILLAGE_SPECIAL_ROLES = [
  "sheriff",
  "doctor",
  "seer",
  "cupid",
  "knight",
  "police",
  "priest",
  "pet",
  "owner"
];
const SETTING_ROLES = [...VILLAGE_SPECIAL_ROLES, ...SPECIAL_WOLF_ROLES, "jester"];

const PHASE_NAMES = {
  lobby: "รอผู้เล่น",
  night: "กลางคืน",
  day: "สนทนากลางวัน",
  vote: "ลงคะแนน",
  ended: "จบเกม"
};

function isWolf(player) {
  return Boolean(player && WOLF_ROLES.has(player.role));
}

function factionOf(player) {
  if (!player?.role) return null;
  if (isWolf(player)) return "wolf";
  if (player.role === "jester") return "neutral";
  return "village";
}

function hasWolfChat(player) {
  return isWolf(player) && player.role !== "loneWolf";
}

function nightVoteWeight(player) {
  return player.role === "alpha" ? 2 : 1;
}

const NAME_ANIMALS = [
  "แมวน้อย", "กระต่าย", "นกฮูก", "จิ้งจอก", "หมีน้อย", "ลูกเจี๊ยบ", "เต่าทอง", "แพนด้า",
  "กบน้อย", "ปลาหมึก", "ช้างน้อย", "หนูน้อย", "ลูกหมา", "ม้าลาย", "เพนกวิน", "ปลาโลมา"
];
const NAME_TRAITS = [
  "ขี้เซา", "ใจดี", "ซุกซน", "ขี้อาย", "ร่าเริง", "ใจเย็น", "ขี้สงสัย", "เจ้าเล่ห์",
  "เงียบขรึม", "หัวไว", "ขี้เล่น", "ใจกล้า", "อารมณ์ดี", "ขี้หลง", "หิวโซ", "นักฝัน"
];

function pick(list) {
  return list[crypto.randomInt(list.length)];
}

function cleanName(value) {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  return /^[\p{L}\p{M}\p{N}_ -]{3,24}$/u.test(name) ? name : null;
}

function nameTaken(name, exceptId) {
  const key = name.toLocaleLowerCase();
  for (const user of users.values()) {
    if (user.id !== exceptId && user.nameKey === key) return true;
  }
  return false;
}

function randomName() {
  for (let i = 0; i < 30; i++) {
    const name = pick(NAME_ANIMALS) + pick(NAME_TRAITS);
    if (!nameTaken(name)) return name;
  }
  return pick(NAME_ANIMALS) + pick(NAME_TRAITS) + crypto.randomInt(10, 1000);
}

function makeUser(id, name, avatar, color) {
  return {
    id,
    name,
    nameKey: name.toLocaleLowerCase(),
    avatar: AVATARS.includes(avatar) ? avatar : pick(AVATARS),
    color: COLORS.includes(color) ? color : pick(COLORS),
    lastSeen: Date.now()
  };
}

function getUser(id) {
  return users.get(id) || { id, name: "ผู้เล่น", avatar: AVATARS[0], color: COLORS[0] };
}

function publicUser(user) {
  return { id: user.id, name: user.name, avatar: user.avatar, color: user.color };
}

function card(id) {
  const user = getUser(id);
  return { name: user.name, avatar: user.avatar, color: user.color };
}

// ส่งแจ้งเตือนกลางหน้าจอให้ทุกคนในห้อง
function announce(room, payload) {
  const data = { id: crypto.randomUUID(), ...payload };
  for (const socket of io.sockets.sockets.values()) {
    if (userRoom.get(socket.data.userId) === room.id) socket.emit("announce", data);
  }
}

// รวมคนที่เพิ่งออกจากเกม (รวมคู่รักที่ตามไปด้วย) เป็นแจ้งเตือนเดียว
function announceDeaths(room, title, opts = {}) {
  const deaths = room.pendingDeaths || [];
  room.pendingDeaths = [];
  if (!deaths.length) return;
  const plain = new Set(["เหตุการณ์ในยามค่ำคืน", "มติของหมู่บ้าน"]);
  announce(room, {
    kind: opts.kind || "death",
    title,
    text: opts.text || "",
    players: deaths.map(d => ({
      ...card(d.id),
      roleName: ROLE_NAMES[room.players.find(p => p.id === d.id)?.role] || "",
      note: plain.has(d.reason) ? "" : d.reason
    }))
  });
}

function canActTonight(room, player) {
  if (!player.alive) return false;
  if (isWolf(player)) return true;
  switch (player.role) {
    case "doctor":
    case "seer":
      return true;
    case "knight":
      return !player.knightUsed;
    case "police":
      return !player.policeUsed;
    case "priest":
      return !player.priestUsed && room.players.some(p => !p.alive && !p.left);
    case "cupid":
      return room.round === 1 && alivePlayers(room).length >= 2;
    default:
      return false;
  }
}

// ทุกคนที่ต้องตัดสินใจ (ออนไลน์และยังอยู่) เลือกแล้ว → เร่งจบช่วงทันที
function voteComplete(room) {
  const need = alivePlayers(room).filter(p => isOnline(p.id));
  return need.length > 0 && need.every(p => Object.hasOwn(room.votes, p.id));
}

function nightComplete(room) {
  const need = alivePlayers(room).filter(p => isOnline(p.id) && canActTonight(room, p));
  return need.length > 0 && need.every(p => Object.hasOwn(room.actions, p.id));
}

function advance(room, fn) {
  try {
    fn(room);
  } catch (error) {
    console.error("Game error:", error);
    finish(room, "เกมหยุดเนื่องจากข้อผิดพลาดของระบบ");
  }
}

function tryAdvance(room) {
  if (room.phase === "vote" && voteComplete(room)) {
    advance(room, resolveVote);
    return true;
  }
  if (room.phase === "night" && nightComplete(room)) {
    advance(room, resolveNight);
    return true;
  }
  return false;
}

function extraTallies(room, me) {
  if (room.phase === "vote") {
    const tally = {};
    let skipCount = 0;
    let done = 0;
    for (const p of alivePlayers(room)) {
      const t = room.votes[p.id];
      if (t === undefined) continue;
      done++;
      if (t === "skip") {
        skipCount++;
        continue;
      }
      if (!room.players.some(x => x.id === t && x.alive)) continue;
      tally[t] = (tally[t] || 0) + (p.role === "sheriff" ? 2 : 1);
    }
    return { tally, skipCount, progress: { done, total: alivePlayers(room).length } };
  }
  if (room.phase === "night" && me.alive && hasWolfChat(me)) {
    const tally = {};
    for (const p of alivePlayers(room)) {
      if (!hasWolfChat(p)) continue;
      const t = room.actions[p.id];
      if (typeof t !== "string" || t === "skip") continue;
      tally[t] = (tally[t] || 0) + nightVoteWeight(p);
    }
    return { tally, skipCount: 0, progress: null };
  }
  return { tally: null, skipCount: 0, progress: null };
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function wolfCount(room) {
  const n = room.players.length;
  if (n < 2) return 0;
  return Math.min(
    Math.max(1, Math.floor(n * room.settings.wolfPercent / 100)),
    Math.floor((n - 1) / 2)
  );
}

// random=true: สุ่มตัดบทบาทที่เกินจำนวนคน (ใช้ตอนเริ่มเกม)
// random=false: ตัดตามลำดับคงที่ (ใช้แสดงตัวอย่างในห้องรอ จะได้ไม่กระพริบ)
function planRoles(room, random = false) {
  const n = room.players.length;
  const wolves = wolfCount(room);
  const order = list => (random ? shuffle(list) : list);

  const wolfPool = SPECIAL_WOLF_ROLES.filter(r => room.settings.roles[r]);
  const wolfSpecials = order(wolfPool).slice(0, wolves);

  // แต่ละหน่วยคือบทบาทที่ต้องลงไปพร้อมกัน (สัตว์เลี้ยง+เจ้าของต้องมาเป็นคู่)
  const units = [];
  for (const role of VILLAGE_SPECIAL_ROLES) {
    if (!room.settings.roles[role] || role === "owner") continue;
    units.push(role === "pet" ? ["pet", "owner"] : [role]);
  }
  if (room.settings.roles.jester) units.push(["jester"]);

  let slots = Math.max(0, n - wolves);
  const chosen = [];
  for (const unit of order(units)) {
    if (unit.length <= slots) {
      chosen.push(...unit);
      slots -= unit.length;
    }
  }

  const villageSpecials = chosen.filter(r => r !== "jester");
  const neutrals = chosen.filter(r => r === "jester");
  const requested = wolfPool.length + units.reduce((sum, u) => sum + u.length, 0);
  const used = wolfSpecials.length + chosen.length;

  return {
    wolves,
    wolfSpecials,
    villageSpecials,
    neutrals,
    specials: [...wolfSpecials, ...villageSpecials, ...neutrals],
    villagers: Math.max(0, n - wolves - villageSpecials.length - neutrals.length),
    requested,
    used,
    trimmed: used < requested,
    enough: true
  };
}

function alivePlayers(room) {
  return room.players.filter(p => p.alive);
}

function isOnline(id) {
  return (online.get(id) || 0) > 0;
}

function message(room, channel, text, sender = null) {
  room.messages.push({
    id: crypto.randomUUID(),
    channel,
    text,
    senderId: sender?.id || null,
    name: sender ? getUser(sender.id).name : "ระบบ",
    time: Date.now()
  });
  if (room.messages.length > 500) room.messages.shift();
}

function personal(player, text) {
  player.notes.push(text);
  if (player.notes.length > 40) player.notes.shift();
}

function readableChannels(room, player) {
  const result = ["public"];
  if (room.phase !== "lobby") {
    if (hasWolfChat(player)) result.push("wolves");
    if (player.lover) result.push("lovers");
    if (!player.alive) result.push("dead");
  }
  return result;
}

function writableChannels(room, player) {
  if (room.phase === "lobby" || room.phase === "ended") return ["public"];
  if (!player.alive) return ["dead"];

  const result = [];
  if (room.phase === "day" || room.phase === "vote") result.push("public");
  if (room.phase === "night" && hasWolfChat(player)) result.push("wolves");
  if (player.lover) result.push("lovers");
  return result;
}

function snapshot(room, userId) {
  const me = room.players.find(p => p.id === userId);
  if (!me) return null;

  const reads = readableChannels(room, me);

  return {
    id: room.id,
    title: room.title,
    hostId: room.hostId,
    settings: room.settings,
    phase: room.phase,
    phaseName: PHASE_NAMES[room.phase],
    round: room.round,
    endsAt: room.endsAt,
    winner: room.winner,
    plan: planRoles(room),
    clueHistory: room.phase === "ended" ? room.clueHistory : [],
    players: room.players.map(player => {
      const user = getUser(player.id);
      const showRole =
        room.phase === "ended" ||
        !player.alive ||
        player.id === userId ||
        (hasWolfChat(me) && isWolf(player));

      return {
        ...publicUser(user),
        ready: player.ready,
        alive: player.alive,
        left: Boolean(player.left),
        online: isOnline(player.id),
        role: showRole ? player.role : null,
        roleName: showRole ? ROLE_NAMES[player.role] : null,
        faction: showRole ? factionOf(player) : null,
        lover: me.lover === player.id,
        bonded: me.bondId === player.id
      };
    }),
    me: {
      id: me.id,
      alive: me.alive,
      ready: me.ready,
      role: me.role,
      roleName: ROLE_NAMES[me.role] || "",
      description: ROLE_DESCRIPTIONS[me.role] || "",
      faction: factionOf(me),
      loverId: me.lover,
      bondId: me.bondId,
      clue: me.clue,
      notes: me.notes,
      lastHeal: me.lastHeal,
      knightUsed: me.knightUsed,
      policeUsed: me.policeUsed,
      priestUsed: me.priestUsed,
      choice: room.phase === "night" ? (room.actions[me.id] ?? null) : null,
      vote: room.phase === "vote" ? (room.votes[me.id] ?? null) : null
    },
    ...extraTallies(room, me),
    readChannels: reads,
    writeChannels: writableChannels(room, me),
    messages: room.messages.filter(m => reads.includes(m.channel))
  };
}

function broadcastRoom(room) {
  for (const socket of io.sockets.sockets.values()) {
    if (userRoom.get(socket.data.userId) === room.id) {
      socket.emit("state", snapshot(room, socket.data.userId));
    }
  }
}

function publicRooms() {
  return [...rooms.values()]
    .filter(r => r.settings.visibility === "public" && r.phase === "lobby")
    .map(r => ({
      id: r.id,
      title: r.title,
      count: r.players.length,
      capacity: r.settings.capacity,
      wolfPercent: r.settings.wolfPercent
    }));
}

function broadcastLobby() {
  io.emit("rooms", publicRooms());
}

function sync(room) {
  broadcastRoom(room);
  broadcastLobby();
}

function requireRoom(userId) {
  const room = rooms.get(userRoom.get(userId));
  if (!room) throw new Error("คุณยังไม่ได้เข้าห้อง");
  return room;
}

function requireHost(room, userId) {
  if (room.hostId !== userId) throw new Error("เฉพาะเจ้าของห้องเท่านั้น");
}

function cleanSettings(data) {
  const capacity = data.capacity === "" || data.capacity == null ? null : Number(data.capacity);
  const wolfPercent = Number(data.wolfPercent ?? 25);
  const nightSeconds = Number(data.nightSeconds ?? 45);
  const daySeconds = Number(data.daySeconds ?? 90);
  const voteSeconds = Number(data.voteSeconds ?? 30);

  if (capacity !== null && (!Number.isSafeInteger(capacity) || capacity < 4)) {
    throw new Error("จำนวนผู้เล่นต้องเป็นจำนวนเต็มอย่างน้อย 4 หรือเว้นว่าง");
  }
  if (!Number.isInteger(wolfPercent) || wolfPercent < 1 || wolfPercent > 49) {
    throw new Error("เปอร์เซ็นต์หมาป่าต้องอยู่ระหว่าง 1–49");
  }
  for (const seconds of [nightSeconds, daySeconds, voteSeconds]) {
    if (!Number.isInteger(seconds) || seconds < 15 || seconds > 600) {
      throw new Error("เวลาแต่ละช่วงต้องอยู่ระหว่าง 15–600 วินาที");
    }
  }

  const roles = {};
  for (const role of SETTING_ROLES) {
    roles[role] = Boolean(data.roles?.[role]);
  }
  const enablePetPair = roles.pet || roles.owner;
  roles.pet = enablePetPair;
  roles.owner = enablePetPair;

  return {
    capacity,
    wolfPercent,
    visibility: data.visibility === "public" ? "public" : "private",
    roles,
    nightSeconds,
    daySeconds,
    voteSeconds
  };
}

function newPlayer(id) {
  return {
    id,
    ready: false,
    alive: true,
    left: false,
    role: null,
    lover: null,
    bondId: null,
    clue: null,
    notes: [],
    lastHeal: null,
    knightUsed: false,
    policeUsed: false,
    priestUsed: false,
    lastChatAt: 0
  };
}

function leaveRoom(userId) {
  const room = rooms.get(userRoom.get(userId));
  if (!room) return;

  const inGame = !["lobby", "ended"].includes(room.phase);
  const player = room.players.find(p => p.id === userId);
  const name = getUser(userId).name;

  userRoom.delete(userId);
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.userId === userId) socket.emit("state", null);
  }

  if (inGame) {
    // ออกกลางเกม: นับว่าออกจากเกม (ผู้เล่นยังอยู่ในรายชื่อห้อง แต่ถูกทำเครื่องหมายว่าออกแล้ว)
    player.left = true;
    const present = room.players.filter(p => !p.left);
    if (!present.length) {
      clearTimeout(room.timer);
      rooms.delete(room.id);
      broadcastLobby();
      return;
    }
    if (room.hostId === userId) {
      room.hostId = (present.find(p => isOnline(p.id)) || present[0]).id;
    }
    if (player.alive) {
      eliminate(room, player, "ผู้เล่นออกจากเกมกลางคัน");
      announceDeaths(room, "มีผู้เล่นออกจากเกม");
    } else message(room, "public", `${name} ออกจากห้อง`);
    if (checkWin(room)) return;
    if (!tryAdvance(room)) sync(room);
    return;
  }

  room.players = room.players.filter(p => p.id !== userId);
  const present = room.players.filter(p => !p.left);

  if (!present.length) {
    clearTimeout(room.timer);
    rooms.delete(room.id);
  } else {
    if (room.hostId === userId) room.hostId = present[0].id;
    message(room, "public", `${name} ออกจากห้อง`);
    broadcastRoom(room);
  }
  broadcastLobby();
}

const CLUE_WORDS = [...new Set([
  "ระฆัง", "กระจก", "เทียน", "กุญแจ", "หนังสือ", "นาฬิกา", "ร่ม", "หน้ากาก", "ดอกกุหลาบ", "จดหมาย",
  "ขนนก", "เข็มทิศ", "กล่องดนตรี", "ลูกแก้ว", "ผ้าพันคอ", "รองเท้า",
  "แว่นตา", "หมวก", "กรรไกร", "ค้อน", "บันได", "ตะเกียง", "โคมไฟ", "ผ้าห่ม", "หมอน", "ตุ๊กตา",
  "ลูกโป่ง", "ว่าว", "จักรยาน", "เรือ", "รถไฟ", "เครื่องบิน", "กล้องถ่ายรูป", "โทรศัพท์", "โทรทัศน์",
  "วิทยุ", "พัดลม", "ตู้เย็น", "กระเป๋าเดินทาง", "แผนที่", "ดาบ", "โล่", "มงกุฎ", "แหวน", "สร้อยคอ",
  "ส้มตำ", "ต้มยำกุ้ง", "ข้าวผัด", "ผัดไทย", "ไอศกรีม", "ช็อกโกแลต", "ข้าวเหนียวมะม่วง", "ชานมไข่มุก",
  "กาแฟ", "น้ำแข็งไส", "ไข่เจียว", "หมูปิ้ง", "ก๋วยเตี๋ยว", "ข้าวมันไก่", "ซาลาเปา", "ขนมปัง", "พิซซ่า",
  "แฮมเบอร์เกอร์", "ทุเรียน", "มะม่วง", "แตงโม", "กล้วย", "สับปะรด", "เงาะ", "ลำไย", "ป๊อปคอร์น",
  "โรงเรียน", "โรงพยาบาล", "วัด", "ตลาด", "สวนสาธารณะ", "ห้องสมุด", "ชายหาด", "ภูเขา", "น้ำตก",
  "ทะเลทราย", "ถ้ำ", "สนามบิน", "สถานีรถไฟ", "ปราสาท", "ประภาคาร", "สะพาน", "ตลาดน้ำ", "สวนสัตว์",
  "โรงหนัง", "ฟาร์ม", "ร้านสะดวกซื้อ", "ลิฟต์",
  "ดวงจันทร์", "ดวงอาทิตย์", "ดาวตก", "สายรุ้ง", "ฟ้าผ่า", "พายุ", "หมอก", "หิมะ", "ภูเขาไฟ",
  "ทะเลสาบ", "ป่าไผ่", "ทุ่งนา", "ดอกทานตะวัน", "ดอกบัว", "เห็ด", "กองไฟ", "เกาะร้าง",
  "ช้าง", "ปลาโลมา", "นกแก้ว", "ผีเสื้อ", "เต่า", "ม้า", "ลิง", "แมว", "สุนัข", "งู", "จระเข้",
  "เพนกวิน", "หมีแพนด้า", "ค้างคาว", "แมงมุม", "ปลาการ์ตูน",
  "ครู", "นักดับเพลิง", "พ่อครัว", "ช่างตัดผม", "นักบิน", "ชาวนา", "นักร้อง", "จิตรกร", "นักมายากล",
  "งานวัด", "ดอกไม้ไฟ", "วันเกิด", "งานแต่งงาน", "ปิกนิก", "ตั้งแคมป์", "ตกปลา", "ว่ายน้ำ",
  "เกมกระดาน", "ไพ่", "หมากรุก", "กีตาร์", "เปียโน", "กลอง", "ขลุ่ย", "ระนาด", "ภาพวาด", "ภาพยนตร์"
])];

// ชาวบ้านทุกคนได้ "คำเดียวกัน" ส่วนหมาป่าไม่ได้รับคำใด ๆ
function makeClues(room) {
  if (!room.wordPool?.length) room.wordPool = shuffle(CLUE_WORDS);
  const word = room.wordPool.pop();

  room.clueHistory.push({
    round: room.round,
    sentence: `คำของฝั่งชาวบ้านคือ "${word}" (หมาป่าไม่ได้รับคำ)`
  });

  for (const p of alivePlayers(room)) {
    p.clue = isWolf(p)
      ? null
      : { round: room.round, type: "คำของฝั่งชาวบ้าน (ทุกคนได้คำเดียวกัน)", text: word };
  }
}

function setPhase(room, phase, seconds) {
  clearTimeout(room.timer);
  room.phase = phase;
  room.endsAt = Date.now() + seconds * 1000;

  room.timer = setTimeout(() => {
    try {
      if (phase === "night") resolveNight(room);
      else if (phase === "day") (room.round === 1 ? beginNight(room) : beginVote(room));
      else if (phase === "vote") resolveVote(room);
    } catch (error) {
      console.error("Game error:", error);
      finish(room, "เกมหยุดเนื่องจากข้อผิดพลาดของระบบ");
    }
  }, seconds * 1000);
}

function finish(room, winner) {
  clearTimeout(room.timer);
  room.phase = "ended";
  room.endsAt = null;
  room.winner = winner;
  message(room, "public", `จบเกม — ${winner}`);
  announce(room, { kind: "end", title: "จบเกม", text: winner, players: [] });
  sync(room);
}

function checkWin(room) {
  const alive = alivePlayers(room);
  if (!alive.length) {
    finish(room, "เสมอ");
    return true;
  }
  if (alive.length === 2 && alive[0].lover === alive[1].id) {
    finish(room, "คู่รักชนะ");
    return true;
  }

  const wolves = alive.filter(isWolf).length;
  const others = alive.length - wolves;

  if (wolves === 0) {
    const villageSurvivors = alive.filter(p => factionOf(p) === "village");
    if (villageSurvivors.length) finish(room, "ฝ่ายชาวบ้านชนะ");
    else finish(room, "เสมอ — ไม่มีฝ่ายหลักเหลือ และตัวตลกไม่ถูกโหวตออก");
    return true;
  }

  if (wolves >= others) {
    finish(room, "ฝ่ายหมาป่าชนะ");
    return true;
  }

  return false;
}

function eliminate(room, player, reason, killerIds = []) {
  if (!player?.alive) return;
  player.alive = false;
  (room.pendingDeaths ||= []).push({ id: player.id, reason });
  message(room, "public", `${getUser(player.id).name} ออกจากเกม — ${reason} (บทบาท: ${ROLE_NAMES[player.role]})`);

  if (player.bondId) {
    const partner = room.players.find(p => p.id === player.bondId);
    if (partner?.alive) {
      const names = [...new Set(killerIds)].map(id => getUser(id)?.name).filter(Boolean);
      personal(
        partner,
        `${getUser(player.id).name} ออกจากเกม — ${reason}. ` +
          (names.length ? `ผู้ลงมือหรือผู้ร่วมลงคะแนน: ${names.join(", ")}` : "ไม่มีผู้ลงมือโดยตรงที่ระบุได้")
      );
    }
  }

  if (player.lover) {
    const lover = room.players.find(p => p.id === player.lover);
    if (lover?.alive) eliminate(room, lover, "สายสัมพันธ์คู่รัก");
  }
}

function beginDay(room) {
  room.actions = {};
  room.votes = {};
  makeClues(room);
  message(
    room,
    "public",
    room.round === 1
      ? "เช้าวันที่ 1 — วันแรกยังไม่มีการโหวต แลกเปลี่ยนเบาะแสกันก่อน"
      : `เช้าวันที่ ${room.round} — สนทนาและแลกเปลี่ยนเบาะแส`
  );
  announce(room, {
    kind: "phase",
    title: room.round === 1 ? "เกมเริ่มแล้ว · เช้าวันที่ 1" : `เช้าวันที่ ${room.round}`,
    text: room.round === 1 ? "วันแรกยังไม่มีการโหวต แลกเปลี่ยนคำใบ้กันก่อน" : "สนทนาและหาตัวหมาป่า",
    players: []
  });
  setPhase(room, "day", room.settings.daySeconds);
  sync(room);
}

function beginNight(room) {
  room.actions = {};
  room.votes = {};
  message(room, "public", `เริ่มคืนที่ ${room.round}`);
  announce(room, { kind: "phase", title: `คืนที่ ${room.round}`, text: "หมู่บ้านหลับใหล ใครมีความสามารถให้เลือกเป้าหมาย", players: [] });
  setPhase(room, "night", room.settings.nightSeconds);
  sync(room);
}

function topTargets(scores) {
  const entries = [...scores.entries()];
  if (!entries.length) return [];
  const best = Math.max(...entries.map(([, value]) => value));
  return entries.filter(([, value]) => value === best).map(([id]) => id);
}

function resolveNight(room) {
  const actors = alivePlayers(room);
  const aliveBefore = new Set(actors.map(p => p.id));

  if (room.round === 1) {
    const cupid = actors.find(p => p.role === "cupid");
    const pair = cupid && room.actions[cupid.id];
    if (Array.isArray(pair) && pair.length === 2) {
      const first = room.players.find(p => p.id === pair[0] && p.alive);
      const second = room.players.find(p => p.id === pair[1] && p.alive);
      if (first && second && first.id !== second.id) {
        first.lover = second.id;
        second.lover = first.id;
        personal(first, `คู่รักของคุณคือ ${getUser(second.id).name}`);
        personal(second, `คู่รักของคุณคือ ${getUser(first.id).name}`);
        personal(cupid, "ผูกคู่รักสำเร็จ");
      }
    }
  }

  for (const priest of actors.filter(p => p.role === "priest")) {
    const targetId = room.actions[priest.id];
    const target = room.players.find(p => p.id === targetId && !p.alive && !p.left);
    if (!target) continue;
    target.alive = true;
    target.clue = null;
    priest.priestUsed = true;
    announce(room, { kind: "revive", title: "มีผู้กลับเข้าสู่เกม", text: "ถูกคืนชีพ", players: [card(target.id)] });
    message(room, "public", `${getUser(target.id).name} กลับเข้าสู่เกมจากการคืนชีพ`);
    personal(target, "คุณถูกคืนชีพ บทบาทและจำนวนครั้งของความสามารถยังคงเดิม");
    personal(priest, `คืนชีพ ${getUser(target.id).name} สำเร็จ`);
  }

  for (const seer of actors.filter(p => p.role === "seer")) {
    const target = room.players.find(p => p.id === room.actions[seer.id]);
    if (!target) continue;
    const detectedWolf = isWolf(target) && target.role !== "hybrid";
    personal(
      seer,
      `คืน ${room.round}: ${getUser(target.id).name} ` + (detectedWolf ? "เป็นหมาป่า" : "ไม่ใช่หมาป่า")
    );
  }

  const doctorProtected = new Set();
  for (const doctor of actors.filter(p => p.role === "doctor")) {
    const targetId = room.actions[doctor.id];
    if (typeof targetId === "string" && targetId !== "skip") {
      doctorProtected.add(targetId);
      doctor.lastHeal = targetId;
    } else {
      doctor.lastHeal = null;
    }
  }

  const wolfActors = actors.filter(isWolf);
  const scores = new Map();
  for (const wolf of wolfActors) {
    const targetId = room.actions[wolf.id];
    if (typeof targetId !== "string" || targetId === "skip") continue;
    scores.set(targetId, (scores.get(targetId) || 0) + nightVoteWeight(wolf));
  }

  const leaders = topTargets(scores);
  const victimId = leaders.length ? leaders[crypto.randomInt(leaders.length)] : null;
  const attacks = new Map();

  function addAttack(targetId, killerIds) {
    if (!targetId) return;
    if (!attacks.has(targetId)) attacks.set(targetId, new Set());
    for (const kid of killerIds) attacks.get(targetId).add(kid);
  }

  if (victimId) {
    const participants = wolfActors.filter(w => room.actions[w.id] === victimId).map(w => w.id);
    addAttack(victimId, participants);
  }

  const policePenalties = [];
  for (const police of actors.filter(p => p.role === "police")) {
    const targetId = room.actions[police.id];
    const target = room.players.find(p => p.id === targetId);
    if (!target) continue;
    police.policeUsed = true;
    addAttack(target.id, [police.id]);
    if (!isWolf(target)) policePenalties.push(police);
  }

  const successfulAttacks = [];
  for (const [targetId, killers] of attacks) {
    const target = room.players.find(p => p.id === targetId && p.alive);
    if (!target) continue;
    if (doctorProtected.has(targetId)) continue;

    const knight = actors.find(
      p => p.role === "knight" && !p.knightUsed && room.actions[p.id] === targetId
    );
    if (knight) {
      knight.knightUsed = true;
      personal(knight, "คุณช่วยผู้เล่นได้สำเร็จ พลังอัศวินถูกใช้แล้ว");
      continue;
    }

    successfulAttacks.push({ target, killerIds: [...killers] });
  }

  for (const attack of successfulAttacks) {
    eliminate(room, attack.target, "เหตุการณ์ในยามค่ำคืน", attack.killerIds);
  }

  for (const police of policePenalties) {
    personal(police, "คุณเลือกคนที่ไม่ใช่ฝ่ายหมาป่า จึงได้รับผลเสียของความสามารถ");
    eliminate(room, police, "ผลจากการใช้ความสามารถผิดเป้าหมาย");
  }

  const newlyOut = room.players.filter(p => aliveBefore.has(p.id) && !p.alive);
  if (!newlyOut.length) {
    message(room, "public", "คืนนี้ไม่มีผู้เล่นออกจากเกม");
    announce(room, { kind: "safe", title: "คืนนี้ปลอดภัย", text: "ไม่มีผู้เล่นออกจากเกม", players: [] });
  } else {
    announceDeaths(room, "มีผู้ออกจากเกมในคืนนี้");
  }

  if (checkWin(room)) return;

  room.round++;
  beginDay(room);
}

function beginVote(room) {
  room.votes = {};
  message(room, "public", "เริ่มลงคะแนน เลือกผู้ต้องสงสัยหรืองดออกเสียง");
  announce(room, { kind: "phase", title: "ถึงเวลาลงคะแนน", text: "แตะการ์ดผู้เล่นเพื่อโหวต", players: [] });
  setPhase(room, "vote", room.settings.voteSeconds);
  sync(room);
}

function resolveVote(room) {
  const voters = alivePlayers(room);
  const scores = new Map();

  for (const player of voters) {
    const targetId = room.votes[player.id];
    if (!targetId || targetId === "skip") continue;
    if (!room.players.some(p => p.id === targetId && p.alive)) continue;
    const weight = player.role === "sheriff" ? 2 : 1;
    scores.set(targetId, (scores.get(targetId) || 0) + weight);
  }

  const summary = [...scores.entries()].map(([id, val]) => `${getUser(id).name}: ${val}`).join(" / ");
  message(room, "public", `ผลคะแนน: ${summary || "ไม่มีคะแนน"}`);

  const leaders = topTargets(scores);
  if (leaders.length === 1) {
    const target = room.players.find(p => p.id === leaders[0]);
    const killerIds = voters.filter(p => room.votes[p.id] === target.id).map(p => p.id);
    eliminate(room, target, "มติของหมู่บ้าน", killerIds);
    announceDeaths(room, "ถูกโหวตออก", { kind: "vote", text: `ได้ ${scores.get(target.id)} คะแนน` });

    if (target.role === "jester") {
      finish(room, `ตัวตลกชนะ — ${getUser(target.id).name} ถูกโหวตออกสำเร็จ`);
      return;
    }
  } else {
    const text = leaders.length ? "คะแนนเสมอ ไม่มีใครออกจากเกม" : "ไม่มีใครถูกเลือก";
    message(room, "public", text);
    announce(room, { kind: "tie", title: leaders.length ? "คะแนนเสมอ" : "ไม่มีใครถูกโหวต", text, players: [] });
  }

  if (!checkWin(room)) beginNight(room);
}

io.use((socket, next) => {
  const origin = socket.handshake.headers.origin;
  const host = socket.handshake.headers.host;
  if (origin) {
    try {
      if (new URL(origin).host !== host) return next(new Error("ไม่อนุญาต origin นี้"));
    } catch {
      return next(new Error("Origin ไม่ถูกต้อง"));
    }
  }

  const auth = socket.handshake.auth || {};
  const token = String(auth.token || "");
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(token)) return next(new Error("ข้อมูลผู้เล่นไม่ถูกต้อง"));

  // token เป็นความลับของเครื่องผู้เล่น คนอื่นเห็นแค่ id ที่แฮชแล้ว
  const id = "u" + crypto.createHash("sha256").update(token).digest("hex").slice(0, 16);
  if (!users.has(id)) {
    if (users.size >= 5000) return next(new Error("เซิร์ฟเวอร์เต็ม กรุณาลองใหม่ภายหลัง"));
    const wanted = cleanName(auth.name);
    users.set(id, makeUser(id, wanted && !nameTaken(wanted) ? wanted : randomName(), auth.avatar, auth.color));
  }

  socket.data.userId = id;
  next();
});

io.on("connection", socket => {
  const userId = socket.data.userId;
  online.set(userId, (online.get(userId) || 0) + 1);
  socket.emit("me", publicUser(getUser(userId)));
  socket.emit("rooms", publicRooms());

  const current = rooms.get(userRoom.get(userId));
  if (current) broadcastRoom(current);
  else socket.emit("state", null);

  function on(event, handler) {
    socket.on(event, (data, ack) => {
      if (typeof ack !== "function") ack = () => {};
      try {
        const now = Date.now();
        const key = `last:${event}`;
        if (now - (socket.data[key] || 0) < 100) throw new Error("กรุณารอสักครู่ก่อนทำซ้ำ");
        socket.data[key] = now;
        const result = handler(data || {});
        ack({ ok: true, ...(result || {}) });
      } catch (error) {
        ack({ ok: false, error: error.message || "เกิดข้อผิดพลาด" });
      }
    });
  }

  on("avatar", data => {
    if (!AVATARS.includes(data.avatar) || !COLORS.includes(data.color)) {
      throw new Error("อวตารไม่ถูกต้อง");
    }
    const user = getUser(userId);
    user.avatar = data.avatar;
    user.color = data.color;
    const room = rooms.get(userRoom.get(userId));
    if (room) broadcastRoom(room);
    return { user: publicUser(user) };
  });

  on("rename", data => {
    const room = rooms.get(userRoom.get(userId));
    if (room && !["lobby", "ended"].includes(room.phase)) throw new Error("เปลี่ยนชื่อระหว่างเกมไม่ได้");
    const user = getUser(userId);
    const name = data.random ? randomName() : cleanName(data.name);
    if (!name) throw new Error("ชื่อยาว 3–24 ตัว ใช้ตัวอักษร ตัวเลข ช่องว่าง _ หรือ -");
    if (nameTaken(name, userId)) throw new Error("ชื่อนี้มีคนใช้อยู่แล้ว");
    const oldName = user.name;
    user.name = name;
    user.nameKey = name.toLocaleLowerCase();
    if (room) {
      message(room, "public", `${oldName} เปลี่ยนชื่อเป็น ${name}`);
      broadcastRoom(room);
    }
    return { user: publicUser(user) };
  });

  on("create", data => {
    if (userRoom.has(userId)) throw new Error("กรุณาออกจากห้องเดิมก่อน");
    const settings = cleanSettings(data);
    let id;
    do {
      id = String(crypto.randomInt(10_000_000, 100_000_000));
    } while (rooms.has(id));

    const room = {
      id,
      title: String(data.title || "หมู่บ้านลึกลับ").trim().slice(0, 50),
      hostId: userId,
      settings,
      players: [newPlayer(userId)],
      phase: "lobby",
      round: 0,
      winner: null,
      endsAt: null,
      timer: null,
      messages: [],
      actions: {},
      votes: {},
      clueHistory: [],
      pendingDeaths: [],
      createdAt: Date.now()
    };

    rooms.set(id, room);
    userRoom.set(userId, id);
    message(room, "public", "สร้างห้องแล้ว ส่งเลขห้องให้เพื่อนเข้าร่วมได้");
    sync(room);
  });

  on("join", data => {
    const id = String(data.id || "").trim();
    const oldId = userRoom.get(userId);
    if (oldId === id) {
      broadcastRoom(requireRoom(userId));
      return;
    }
    if (oldId) throw new Error("กรุณาออกจากห้องเดิมก่อน");

    const room = rooms.get(id);
    if (!room) throw new Error("ไม่พบเลขห้องนี้");
    if (room.phase !== "lobby") throw new Error("ห้องนี้เริ่มเกมแล้ว");
    if (room.settings.capacity !== null && room.players.length >= room.settings.capacity) {
      throw new Error("ห้องเต็มแล้ว");
    }

    room.players.push(newPlayer(userId));
    userRoom.set(userId, id);
    message(room, "public", `${getUser(userId).name} เข้าร่วมหมู่บ้าน`);
    sync(room);
  });

  on("leave", () => leaveRoom(userId));

  on("ready", () => {
    const room = requireRoom(userId);
    if (room.phase !== "lobby") throw new Error("เกมเริ่มแล้ว");
    const player = room.players.find(p => p.id === userId);
    player.ready = !player.ready;
    broadcastRoom(room);
  });

  on("start", () => {
    const room = requireRoom(userId);
    requireHost(room, userId);
    if (room.phase !== "lobby") throw new Error("เกมเริ่มแล้ว");
    if (room.players.length < 4) throw new Error("ต้องมีผู้เล่นอย่างน้อย 4 คน");
    if (!room.players.every(p => p.ready)) throw new Error("ผู้เล่นทุกคนต้องกดพร้อมก่อน");
    if (!room.players.every(p => isOnline(p.id))) throw new Error("ยังมีผู้เล่นออฟไลน์อยู่");

    // บทบาทที่เลือกไว้เกินจำนวนคน → สุ่มตัดออกให้พอดี เริ่มเกมได้เลยโดยไม่ต้องรอใครพร้อม
    const plan = planRoles(room, true);

    const deck = shuffle([
      ...Array(plan.wolves - plan.wolfSpecials.length).fill("wolf"),
      ...plan.wolfSpecials,
      ...plan.villageSpecials,
      ...plan.neutrals,
      ...Array(plan.villagers).fill("villager")
    ]);

    room.players.forEach((p, index) => {
      Object.assign(p, newPlayer(p.id), { role: deck[index] });
    });

    const pet = room.players.find(p => p.role === "pet");
    const owner = room.players.find(p => p.role === "owner");
    if (pet && owner) {
      pet.bondId = owner.id;
      owner.bondId = pet.id;
      personal(pet, `เจ้าของของคุณคือ ${getUser(owner.id).name}`);
      personal(owner, `สัตว์เลี้ยงของคุณคือ ${getUser(pet.id).name}`);
    }

    room.messages = [];
    room.round = 1;
    room.winner = null;
    room.clueHistory = [];
    room.wordPool = null;
    room.pendingDeaths = [];
    if (plan.trimmed) {
      message(room, "public", `บทบาทที่เลือกมากกว่าจำนวนผู้เล่น ระบบสุ่มใช้ ${plan.used} จาก ${plan.requested} บทบาท`);
    }
    beginDay(room);
  });

  on("settings", data => {
    const room = requireRoom(userId);
    requireHost(room, userId);
    if (room.phase !== "lobby") throw new Error("ปรับตั้งค่าได้เฉพาะตอนรอผู้เล่น");

    const settings = cleanSettings(data);
    if (settings.capacity !== null && settings.capacity < room.players.length) {
      throw new Error(`จำนวนผู้เล่นสูงสุดต้องไม่น้อยกว่าคนในห้องตอนนี้ (${room.players.length} คน)`);
    }

    room.settings = settings;
    const title = String(data.title || "").trim().slice(0, 50);
    if (title) room.title = title;
    message(room, "public", "เจ้าของห้องปรับการตั้งค่าห้อง");
    sync(room);
  });

  on("reset", () => {
    const room = requireRoom(userId);
    requireHost(room, userId);
    if (room.phase !== "ended") throw new Error("เกมยังไม่จบ");

    room.players = room.players.filter(p => !p.left).map(p => newPlayer(p.id));
    room.phase = "lobby";
    room.round = 0;
    room.winner = null;
    room.endsAt = null;
    room.actions = {};
    room.votes = {};
    room.messages = [];
    room.clueHistory = [];
    room.wordPool = null;

    message(room, "public", "กลับสู่ห้องรอ กดพร้อมเพื่อเล่นรอบใหม่");
    sync(room);
  });

  on("action", data => {
    const room = requireRoom(userId);
    const player = room.players.find(p => p.id === userId);

    if (room.phase !== "night" || !player.alive) {
      throw new Error("ใช้ความสามารถได้เฉพาะกลางคืนขณะยังอยู่ในเกม");
    }
    if (player.role === "knight" && player.knightUsed) throw new Error("พลังอัศวินหมดแล้ว");
    if (player.role === "police" && player.policeUsed) throw new Error("ตำรวจใช้ความสามารถไปแล้ว");
    if (player.role === "priest" && player.priestUsed) throw new Error("คุณใช้การคืนชีพไปแล้ว");
    if (!canActTonight(room, player)) throw new Error("คืนนี้คุณไม่มีความสามารถที่ใช้ได้");

    // value: undefined = ยกเลิก, "skip" = ข้าม, id หรือ [id, id] = เลือกเป้าหมาย
    let value;
    if (data.clear) {
      value = undefined;
    } else if (data.skip || data.target === "skip") {
      value = "skip";
    } else if (player.role === "cupid") {
      const ids = data.targets;
      if (
        !Array.isArray(ids) ||
        ids.length !== 2 ||
        ids[0] === ids[1] ||
        !ids.every(id => room.players.some(p => p.id === id && p.alive))
      ) {
        throw new Error("เลือกผู้เล่นที่ยังอยู่ในเกมสองคนที่ต่างกัน");
      }
      value = [ids[0], ids[1]];
    } else if (player.role === "priest") {
      const target = room.players.find(p => p.id === data.target && !p.alive && !p.left);
      if (!target) throw new Error("ต้องเลือกผู้เล่นที่ออกจากเกมแล้ว");
      value = target.id;
    } else {
      const target = room.players.find(p => p.id === data.target && p.alive);
      if (!target) throw new Error("เป้าหมายไม่ถูกต้อง");

      if (isWolf(player)) {
        if (target.id === userId) throw new Error("เลือกตัวเองไม่ได้");
        if (player.role !== "loneWolf" && isWolf(target)) {
          throw new Error("เลือกหมาป่าด้วยกันไม่ได้");
        }
      }
      if (["seer", "police"].includes(player.role) && target.id === userId) {
        throw new Error("เลือกตัวเองไม่ได้");
      }
      if (player.role === "doctor" && target.id === player.lastHeal) {
        throw new Error("หมอเลือกคนเดิมติดกันไม่ได้");
      }
      value = target.id;
    }

    const before = JSON.stringify(room.actions[userId] ?? null);
    if (value === undefined) delete room.actions[userId];
    else room.actions[userId] = value;

    if (JSON.stringify(value ?? null) !== before && isWolf(player) && hasWolfChat(player)) {
      const name = getUser(userId).name;
      const text =
        value === undefined
          ? `${name} ยกเลิกการเลือก`
          : value === "skip"
            ? `${name} ข้ามคืนนี้`
            : `${name} เลือก ${getUser(value).name}` + (player.role === "alpha" ? " — น้ำหนัก 2 คะแนน" : "");
      message(room, "wolves", text);
    }

    if (!tryAdvance(room)) broadcastRoom(room);
  });

  on("vote", data => {
    const room = requireRoom(userId);
    const player = room.players.find(p => p.id === userId);

    if (room.phase !== "vote" || !player.alive) throw new Error("ยังลงคะแนนไม่ได้");

    if (data.target === null || data.clear) {
      delete room.votes[userId];
    } else {
      if (data.target !== "skip" && !room.players.some(p => p.id === data.target && p.alive)) {
        throw new Error("เป้าหมายไม่ถูกต้อง");
      }
      room.votes[userId] = data.target;
    }

    if (!tryAdvance(room)) broadcastRoom(room);
  });

  on("chat", data => {
    const room = requireRoom(userId);
    const player = room.players.find(p => p.id === userId);

    if (!writableChannels(room, player).includes(data.channel)) {
      throw new Error("ส่งข้อความในช่องนี้ไม่ได้ในขณะนี้");
    }

    const text = String(data.text || "").trim();
    if (!text || text.length > 300) throw new Error("ข้อความต้องยาว 1–300 ตัวอักษร");
    if (Date.now() - player.lastChatAt < 800) throw new Error("ส่งข้อความเร็วเกินไป");

    player.lastChatAt = Date.now();
    message(room, data.channel, text, player);
    broadcastRoom(room);
  });

  socket.on("disconnect", () => {
    const left = (online.get(userId) || 1) - 1;
    if (left > 0) online.set(userId, left);
    else online.delete(userId);
    const user = users.get(userId);
    if (user) user.lastSeen = Date.now();
    const room = rooms.get(userRoom.get(userId));
    if (room) broadcastRoom(room);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.players.some(p => !p.left && isOnline(p.id))) {
      room.offlineSince = null;
      continue;
    }
    room.offlineSince ||= now;
    if (now - room.offlineSince > 30 * 60 * 1000) {
      clearTimeout(room.timer);
      for (const p of room.players) if (!p.left) userRoom.delete(p.id);
      rooms.delete(room.id);
    }
  }
  broadcastLobby();
}, 60_000).unref();

setInterval(() => {
  const keep = new Set();
  for (const room of rooms.values()) for (const p of room.players) keep.add(p.id);
  const now = Date.now();
  for (const [id, user] of users) {
    if (!isOnline(id) && !keep.has(id) && now - user.lastSeen > 10 * 60 * 1000) users.delete(id);
  }
}, 60_000).unref();

app.use(express.static(path.join(__dirname, "public")));

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Werewolf server is listening on port ${PORT}`);
});
