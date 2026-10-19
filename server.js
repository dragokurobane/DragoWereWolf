const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 32 * 1024
});

const PORT = Number(process.env.PORT || 3000);
const PROD = process.env.NODE_ENV === "production";
const USER_FILE = path.join(__dirname, "users.json");

app.disable("x-powered-by");
app.use(express.json({ limit: "8kb" }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});

let users = fs.existsSync(USER_FILE)
  ? JSON.parse(fs.readFileSync(USER_FILE, "utf8"))
  : [];

const sessions = new Map();
const rooms = new Map();
const userRoom = new Map();
const loginBuckets = new Map();

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
  villager: "ใช้เบาะแสและบทสนทนาเพื่อค้นหาฝ่ายหมาป่า",
  wolf: "ร่วมกับฝูงเลือกเป้าหมายตอนกลางคืน",
  sheriff: "คะแนนโหวตกลางวันมีน้ำหนัก 2 คะแนน",
  doctor: "ปกป้องหนึ่งคนต่อคืน แต่เลือกคนเดิมติดกันไม่ได้",
  seer: "ตรวจหนึ่งคนต่อคืน แต่ลูกครึ่งจะให้ผลว่าไม่ใช่หมาป่า",
  cupid: "คืนแรกเลือกผู้เล่นสองคนเป็นคู่รัก รวมตัวเองได้",
  knight: "ปกป้องหนึ่งคนต่อคืน พลังหมดเมื่อช่วยสำเร็จ",
  police: "จัดการเป้าหมายได้ 1 ครั้ง หากเลือกคนที่ไม่ใช่ฝ่ายหมาป่าจะออกจากเกมด้วย",
  loneWolf: "อยู่ฝ่ายหมาป่า แต่ไม่รู้ว่าใครเป็นพวกเดียวกัน และไม่มีแชทหมาป่า",
  hybrid: "อยู่ฝ่ายหมาป่า แต่ผู้หยั่งรู้จะตรวจคุณเป็นชาวบ้าน",
  alpha: "อยู่ฝ่ายหมาป่า คะแนนเลือกเป้าหมายกลางคืนมีน้ำหนัก 2",
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

function saveUsers() {
  const temporary = USER_FILE + ".tmp";
  fs.writeFileSync(temporary, JSON.stringify(users, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, USER_FILE);
}

function getUser(id) {
  return users.find(u => u.id === id);
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    avatar: user.avatar,
    color: user.color
  };
}

function cookieToken(raw = "") {
  const item = raw.split(";").map(v => v.trim()).find(v => v.startsWith("wwsid="));
  return item ? item.slice(6) : "";
}

function getSession(token) {
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expires < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function issueSession(res, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, {
    userId,
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000
  });
  res.setHeader(
    "Set-Cookie",
    `wwsid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800` +
      (PROD ? "; Secure" : "")
  );
}

function requireAuth(req, res, next) {
  const token = cookieToken(req.headers.cookie);
  const session = getSession(token);
  if (!session) return res.status(401).json({ error: "กรุณาล็อกอิน" });
  req.userId = session.userId;
  req.token = token;
  next();
}

function limitLogin(req, res, next) {
  const key = req.ip;
  const now = Date.now();
  let bucket = loginBuckets.get(key);

  if (!bucket || bucket.until < now) {
    bucket = { count: 0, until: now + 60_000 };
    loginBuckets.set(key, bucket);
  }

  if (++bucket.count > 20) {
    return res.status(429).json({ error: "ลองบ่อยเกินไป กรุณารอสักครู่" });
  }

  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of loginBuckets) {
    if (bucket.until < now) loginBuckets.delete(key);
  }
  for (const [token, session] of sessions) {
    if (session.expires < now) sessions.delete(token);
  }
}, 60_000).unref();

app.post("/api/register", limitLogin, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const password = String(req.body.password || "");
    const nameKey = name.toLocaleLowerCase();

    if (!/^[\p{L}\p{N}_ -]{3,24}$/u.test(name)) {
      return res.status(400).json({
        error: "ชื่อยาว 3–24 ตัว ใช้ตัวอักษร ตัวเลข ช่องว่าง _ หรือ -"
      });
    }

    if (password.length < 8 || Buffer.byteLength(password) > 72) {
      return res.status(400).json({
        error: "รหัสผ่านอย่างน้อย 8 ตัว และไม่เกิน 72 ไบต์"
      });
    }

    if (users.some(u => u.nameKey === nameKey)) {
      return res.status(409).json({ error: "ชื่อนี้ถูกใช้แล้ว" });
    }

    const hash = await bcrypt.hash(password, 12);

    if (users.some(u => u.nameKey === nameKey)) {
      return res.status(409).json({ error: "ชื่อนี้ถูกใช้แล้ว" });
    }

    const user = {
      id: crypto.randomUUID(),
      name,
      nameKey,
      hash,
      avatar: AVATARS[0],
      color: COLORS[0]
    };

    users.push(user);
    try {
      saveUsers();
    } catch (error) {
      users = users.filter(u => u.id !== user.id);
      throw error;
    }

    issueSession(res, user.id);
    res.json({ user: publicUser(user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "ไม่สามารถสมัครสมาชิกได้" });
  }
});

app.post("/api/login", limitLogin, async (req, res) => {
  try {
    const nameKey = String(req.body.name || "").trim().toLocaleLowerCase();
    const password = String(req.body.password || "");
    const user = users.find(u => u.nameKey === nameKey);

    if (!user || !(await bcrypt.compare(password, user.hash))) {
      return res.status(401).json({ error: "ชื่อหรือรหัสผ่านไม่ถูกต้อง" });
    }

    issueSession(res, user.id);
    res.json({ user: publicUser(user) });
  } catch {
    res.status(500).json({ error: "ไม่สามารถล็อกอินได้" });
  }
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(getUser(req.userId)) });
});

app.post("/api/logout", requireAuth, (req, res) => {
  sessions.delete(req.token);
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.token === req.token) socket.disconnect(true);
  }
  res.setHeader(
    "Set-Cookie",
    "wwsid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" + (PROD ? "; Secure" : "")
  );
  res.json({ ok: true });
});

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

function planRoles(room) {
  const wolves = wolfCount(room);
  const wolfSpecials = SPECIAL_WOLF_ROLES.filter(r => room.settings.roles[r]);
  const villageSpecials = VILLAGE_SPECIAL_ROLES.filter(r => room.settings.roles[r]);
  const neutrals = room.settings.roles.jester ? ["jester"] : [];

  const enoughWolfSlots = wolfSpecials.length <= wolves;
  const enoughPlayerSlots = wolves + villageSpecials.length + neutrals.length <= room.players.length;

  return {
    wolves,
    wolfSpecials,
    villageSpecials,
    neutrals,
    specials: [...wolfSpecials, ...villageSpecials, ...neutrals],
    villagers: Math.max(0, room.players.length - wolves - villageSpecials.length - neutrals.length),
    enoughWolfSlots,
    enoughPlayerSlots,
    enough: enoughWolfSlots && enoughPlayerSlots
  };
}

function alivePlayers(room) {
  return room.players.filter(p => p.alive);
}

function isOnline(id) {
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.userId === id) return true;
  }
  return false;
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
        player.id === userId ||
        (hasWolfChat(me) && isWolf(player));

      return {
        ...publicUser(user),
        ready: player.ready,
        alive: player.alive,
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
      acted: Object.hasOwn(room.actions, me.id),
      voted: Object.hasOwn(room.votes, me.id)
    },
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
  if (!["lobby", "ended"].includes(room.phase)) {
    throw new Error("เกมกำลังเล่นอยู่ กรุณารอจบเกม");
  }

  room.players = room.players.filter(p => p.id !== userId);
  userRoom.delete(userId);

  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.userId === userId) socket.emit("state", null);
  }

  if (!room.players.length) {
    clearTimeout(room.timer);
    rooms.delete(room.id);
  } else {
    if (room.hostId === userId) room.hostId = room.players[0].id;
    message(room, "public", `${getUser(userId).name} ออกจากห้อง`);
    broadcastRoom(room);
  }
  broadcastLobby();
}

function makeClues(room) {
  const vocabulary = shuffle([
    ["ระฆัง", "สิ่งที่ส่งเสียงเมื่อถูกสั่น"],
    ["กระจก", "สิ่งที่สะท้อนภาพ"],
    ["เทียน", "สิ่งที่ให้แสงและค่อย ๆ สั้นลง"],
    ["กุญแจ", "สิ่งที่ใช้เปิดสิ่งที่ปิดล็อก"],
    ["หนังสือ", "สิ่งที่เก็บเรื่องราวไว้เป็นหน้า"],
    ["นาฬิกา", "สิ่งที่บอกการเคลื่อนผ่านของเวลา"],
    ["ร่ม", "สิ่งที่กางเพื่อบังฝน"],
    ["หน้ากาก", "สิ่งที่ใช้ปิดบังใบหน้า"],
    ["ดอกกุหลาบ", "ดอกไม้ที่มักมีหนาม"],
    ["จดหมาย", "ข้อความที่ส่งถึงใครบางคน"],
    ["ขนนก", "สิ่งเบาบางที่ปกคลุมตัวนก"],
    ["เข็มทิศ", "สิ่งที่ช่วยบอกทิศทาง"],
    ["กล่องดนตรี", "ภาชนะเล็กที่บรรเลงเสียงเพลง"],
    ["ลูกแก้ว", "วัตถุกลมเล็กที่มักโปร่งใส"],
    ["ผ้าพันคอ", "สิ่งที่ใช้พันเพื่อให้คออบอุ่น"],
    ["รองเท้า", "สิ่งที่สวมก่อนออกเดินทาง"]
  ]);

  const alive = alivePlayers(room);
  const wolves = shuffle(alive.filter(isWolf));
  const villagers = shuffle(alive.filter(p => !isWolf(p)));
  const size = Math.max(6, wolves.length, villagers.length);

  const fragments = Array.from({ length: size }, (_, index) => {
    const [word, hint] = vocabulary[index % vocabulary.length];
    const marker = index + 1;
    return {
      word: `${word}ที่จุด ${marker}`,
      hint: `จุด ${marker}: ${hint}`,
      sentence: `ที่จุด ${marker} มี${word}`
    };
  });

  const sentence =
    `คืนที่ ${room.round} บนเส้นทางรอบหมู่บ้าน ` +
    fragments.map(x => x.sentence).join(" และ ");

  room.clueHistory.push({ round: room.round, sentence });

  const villageDeck = shuffle(fragments);
  const wolfDeck = shuffle(fragments);

  villagers.forEach((p, index) => {
    p.clue = {
      round: room.round,
      type: "คำจากประโยค",
      text: villageDeck[index].word
    };
  });

  wolves.forEach((p, index) => {
    p.clue = {
      round: room.round,
      type: "คำใบ้ทางอ้อม",
      text: wolfDeck[index].hint
    };
  });
}

function setPhase(room, phase, seconds) {
  clearTimeout(room.timer);
  room.phase = phase;
  room.endsAt = Date.now() + seconds * 1000;

  room.timer = setTimeout(() => {
    try {
      if (phase === "night") resolveNight(room);
      else if (phase === "day") beginVote(room);
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
  message(room, "public", `${getUser(player.id).name} ออกจากเกม — ${reason}`);

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

function beginNight(room) {
  room.round++;
  room.actions = {};
  room.votes = {};
  makeClues(room);
  message(room, "public", `เริ่มคืนที่ ${room.round}`);
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
    const target = room.players.find(p => p.id === targetId && !p.alive);
    if (!target) continue;
    target.alive = true;
    target.clue = null;
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
    if (typeof targetId === "string") {
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
    if (typeof targetId !== "string") continue;
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
  if (!newlyOut.length) message(room, "public", "คืนนี้ไม่มีผู้เล่นออกจากเกม");

  if (checkWin(room)) return;

  message(room, "public", "เช้าแล้ว! สนทนาและแลกเปลี่ยนเบาะแส");
  setPhase(room, "day", room.settings.daySeconds);
  sync(room);
}

function beginVote(room) {
  room.votes = {};
  message(room, "public", "เริ่มลงคะแนน เลือกผู้ต้องสงสัยหรืองดออกเสียง");
  setPhase(room, "vote", room.settings.voteSeconds);
  sync(room);
}

function resolveVote(room) {
  const voters = alivePlayers(room);
  const scores = new Map();

  for (const player of voters) {
    const targetId = room.votes[player.id];
    if (!targetId || targetId === "skip") continue;
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

    if (target.role === "jester") {
      finish(room, `ตัวตลกชนะ — ${getUser(target.id).name} ถูกโหวตออกสำเร็จ`);
      return;
    }
  } else {
    message(room, "public", leaders.length ? "คะแนนเสมอ ไม่มีใครออกจากเกม" : "ไม่มีใครถูกเลือก");
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

  const token = cookieToken(socket.handshake.headers.cookie);
  const session = getSession(token);
  if (!session) return next(new Error("กรุณาล็อกอิน"));

  socket.data.userId = session.userId;
  socket.data.token = token;
  next();
});

io.on("connection", socket => {
  const userId = socket.data.userId;
  socket.emit("rooms", publicRooms());

  const current = rooms.get(userRoom.get(userId));
  if (current) broadcastRoom(current);
  else socket.emit("state", null);

  function on(event, handler) {
    socket.on(event, (data, ack) => {
      if (typeof ack !== "function") ack = () => {};
      try {
        if (!getSession(socket.data.token)) throw new Error("เซสชันหมดอายุ กรุณาล็อกอินใหม่");
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
    const old = { avatar: user.avatar, color: user.color };
    user.avatar = data.avatar;
    user.color = data.color;
    try {
      saveUsers();
    } catch (error) {
      Object.assign(user, old);
      throw new Error("บันทึกอวตารไม่สำเร็จ");
    }
    const room = rooms.get(userRoom.get(userId));
    if (room) broadcastRoom(room);
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

    const plan = planRoles(room);
    if (!plan.enoughWolfSlots) {
      throw new Error(`โควตาหมาป่ามี ${plan.wolves} คน แต่เลือกหมาป่าพิเศษ ${plan.wolfSpecials.length} บทบาท`);
    }
    if (!plan.enoughPlayerSlots) throw new Error("ผู้เล่นไม่พอสำหรับบทบาทที่เลือก");

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
    room.round = 0;
    room.winner = null;
    room.clueHistory = [];
    beginNight(room);
  });

  on("reset", () => {
    const room = requireRoom(userId);
    requireHost(room, userId);
    if (room.phase !== "ended") throw new Error("เกมยังไม่จบ");

    room.players = room.players.map(p => newPlayer(p.id));
    room.phase = "lobby";
    room.round = 0;
    room.winner = null;
    room.endsAt = null;
    room.actions = {};
    room.votes = {};
    room.messages = [];
    room.clueHistory = [];

    message(room, "public", "กลับสู่ห้องรอ กดพร้อมเพื่อเล่นรอบใหม่");
    sync(room);
  });

  on("action", data => {
    const room = requireRoom(userId);
    const player = room.players.find(p => p.id === userId);

    if (room.phase !== "night" || !player.alive) {
      throw new Error("ใช้ความสามารถได้เฉพาะกลางคืนขณะยังอยู่ในเกม");
    }
    if (Object.hasOwn(room.actions, userId)) throw new Error("คุณยืนยันการกระทำไปแล้ว");

    if (player.role === "cupid") {
      if (room.round !== 1) throw new Error("ผูกคู่รักได้เฉพาะคืนแรก");
      const ids = data.targets;
      if (
        !Array.isArray(ids) ||
        ids.length !== 2 ||
        ids[0] === ids[1] ||
        !ids.every(id => room.players.some(p => p.id === id && p.alive))
      ) {
        throw new Error("เลือกผู้เล่นที่ยังอยู่ในเกมสองคนที่ต่างกัน");
      }
      room.actions[userId] = ids;
      broadcastRoom(room);
      return;
    }

    if (player.role === "priest") {
      if (player.priestUsed) throw new Error("คุณใช้การคืนชีพไปแล้ว");
      const target = room.players.find(p => p.id === data.target && !p.alive);
      if (!target) throw new Error("ต้องเลือกผู้เล่นที่ออกจากเกมแล้ว");
      room.actions[userId] = target.id;
      player.priestUsed = true;
      broadcastRoom(room);
      return;
    }

    const allowed = isWolf(player) || ["doctor", "seer", "knight", "police"].includes(player.role);
    if (!allowed) throw new Error("บทบาทนี้ไม่มีความสามารถเลือกเป้าหมายในคืนนี้");

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
    if (player.role === "knight" && player.knightUsed) throw new Error("พลังอัศวินหมดแล้ว");

    if (player.role === "police") {
      if (player.policeUsed) throw new Error("ตำรวจใช้ความสามารถไปแล้ว");
      player.policeUsed = true;
    }

    room.actions[userId] = target.id;
    if (isWolf(player)) {
      message(
        room,
        "wolves",
        `${getUser(userId).name} เลือก ${getUser(target.id).name}` +
          (player.role === "alpha" ? " — น้ำหนัก 2 คะแนน" : "")
      );
    }
    broadcastRoom(room);
  });

  on("vote", data => {
    const room = requireRoom(userId);
    const player = room.players.find(p => p.id === userId);

    if (room.phase !== "vote" || !player.alive) throw new Error("ยังลงคะแนนไม่ได้");
    if (Object.hasOwn(room.votes, userId)) throw new Error("คุณลงคะแนนแล้ว");
    if (data.target !== "skip" && !room.players.some(p => p.id === data.target && p.alive)) {
      throw new Error("เป้าหมายไม่ถูกต้อง");
    }

    room.votes[userId] = data.target;
    broadcastRoom(room);
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
    const room = rooms.get(userRoom.get(userId));
    if (room) broadcastRoom(room);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.players.some(p => isOnline(p.id))) {
      room.offlineSince = null;
      continue;
    }
    room.offlineSince ||= now;
    if (now - room.offlineSince > 30 * 60 * 1000) {
      clearTimeout(room.timer);
      for (const p of room.players) userRoom.delete(p.id);
      rooms.delete(room.id);
    }
  }
  broadcastLobby();
}, 60_000).unref();

app.use(express.static(path.join(__dirname, "public")));

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Werewolf server is listening on port ${PORT}`);
});
