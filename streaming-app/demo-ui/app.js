const GATEWAY_REST = window.location.origin;
const GRAPHQL_URL = `${window.location.protocol}//${window.location.hostname}:4000/`;
const VIDEO_HTTP = `${window.location.protocol}//${window.location.hostname}:3002`;

let activeUserId = "demo-recruiter-1";
let selectedVideo = null;
let lastMode = "rest";

document.addEventListener("DOMContentLoaded", () => {
  refreshAll();
});

async function refreshAll() {
  await checkHealth();
  await loadVideos(lastMode);
}

function logWire({ method, endpoint, grpcHop, kafkaTopic, ms, payload }) {
  const box = document.getElementById("latest-payload-box");
  if (box) {
    box.textContent = JSON.stringify(payload, null, 2);
  }
  const list = document.getElementById("trace-list");
  if (!list) return;
  const time = new Date().toLocaleTimeString();
  const item = document.createElement("div");
  item.className = "panel-soft rounded-xl p-3 font-mono-code text-[11px] space-y-1";
  item.innerHTML = `
    <div class="flex items-center justify-between gap-2">
      <span class="font-bold text-amber-400">${method} ${escapeHtml(endpoint)}</span>
      <span class="text-emerald-400">${ms}ms</span>
    </div>
    <div class="text-slate-300">gRPC: <span class="text-cyan-300">${escapeHtml(grpcHop)}</span></div>
    <div class="flex items-center justify-between text-slate-400">
      <span>Kafka: <span class="text-rose-300">${escapeHtml(kafkaTopic || "none")}</span></span>
      <span>${time}</span>
    </div>
  `;
  list.prepend(item);
}

function clearTrace() {
  document.getElementById("trace-list").innerHTML = "";
  document.getElementById("latest-payload-box").textContent = "// Trace cleared.";
}

async function checkHealth() {
  const t0 = performance.now();
  try {
    const res = await fetch(`${GATEWAY_REST}/api/health`);
    const data = await res.json();
    const ms = Math.round(performance.now() - t0);

    const modeBadge = document.getElementById("kafka-mode-badge");
    if (modeBadge) {
      const brokerUp = data.kafka === "online";
      modeBadge.textContent = brokerUp
        ? "Kafka Broker Connected (:9092)"
        : "No-Docker Local Fallback Active (Kafka Offline)";
      modeBadge.className = brokerUp
        ? "text-xs font-mono-code px-2.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/35"
        : "text-xs font-mono-code px-2.5 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/35";
    }

    const cards = [
      { label: "Express Gateway", port: ":3001", status: data.gatewayRest },
      { label: "Apollo GraphQL", port: ":4000", status: data.graphql },
      { label: "User gRPC", port: ":50051", status: data.userGrpc },
      { label: "Video gRPC", port: ":50052", status: data.videoGrpc },
      { label: "Interaction gRPC", port: ":50053", status: data.interactionGrpc },
      { label: "Kafka Broker", port: ":9092", status: data.kafka, optional: true }
    ];

    document.getElementById("health-grid").innerHTML = cards.map((c) => {
      const ok = c.status === "online";
      const dotCls = ok ? "bg-emerald-400" : (c.optional ? "bg-amber-400" : "bg-red-500");
      const txtCls = ok ? "text-emerald-300" : (c.optional ? "text-amber-300" : "text-red-400");
      const txt = ok ? "ONLINE" : (c.optional ? "FALLBACK" : "OFFLINE");
      return `
        <div class="panel-soft rounded-xl p-3 flex flex-col justify-between gap-1">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-200 truncate">${c.label}</span>
            <span class="w-2 h-2 rounded-full ${dotCls}"></span>
          </div>
          <div class="flex items-center justify-between font-mono-code text-[11px]">
            <span class="text-slate-400">${c.port}</span>
            <span class="${txtCls} font-bold">${txt}</span>
          </div>
        </div>
      `;
    }).join("");

    logWire({
      method: "GET",
      endpoint: "/api/health",
      grpcHop: "TCP Mesh Probe",
      kafkaTopic: data.kafkaMode,
      ms,
      payload: data
    });
  } catch (err) {
    document.getElementById("health-grid").innerHTML = `<div class="text-xs text-red-400 col-span-full">Gateway unreachable: ${escapeHtml(err.message)}</div>`;
  }
}

async function loadVideos(mode = "rest") {
  lastMode = mode;
  ["rest", "graphql", "trending"].forEach((m) => {
    const el = document.getElementById(`tab-${m}`);
    if (!el) return;
    el.className = m === mode
      ? "px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 text-white"
      : "px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:text-white";
  });

  const t0 = performance.now();
  try {
    let videos = [];
    let endpoint = "/api/videos";
    let grpcHop = "video.VideoService/ListVideos";
    let rawPayload = {};

    if (mode === "rest") {
      const r = await fetch(`${GATEWAY_REST}/api/videos`);
      rawPayload = await r.json();
      videos = rawPayload.videos || [];
    } else {
      const qName = mode === "trending" ? "getTrendingVideos" : "getVideos";
      endpoint = `GraphQL { ${qName} }`;
      grpcHop = mode === "trending" ? "video.VideoService/GetTrendingVideos" : "video.VideoService/ListVideos";
      const query = `{ ${qName} { id title description category filename filepath creatorId views likes } }`;
      const r = await fetch(GRAPHQL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      });
      rawPayload = await r.json();
      videos = (rawPayload.data && rawPayload.data[qName]) || [];
    }

    const ms = Math.round(performance.now() - t0);
    renderVideoCards(videos);
    logWire({ method: mode === "rest" ? "GET" : "POST", endpoint, grpcHop, kafkaTopic: "read-only", ms, payload: rawPayload });
  } catch (err) {
    document.getElementById("video-list").innerHTML = `<div class="col-span-full text-xs text-amber-300">Error loading videos: ${escapeHtml(err.message)}</div>`;
  }
}

async function searchVideos() {
  const q = document.getElementById("search-input").value.trim();
  if (!q) return loadVideos(lastMode);
  const t0 = performance.now();
  const r = await fetch(`${GATEWAY_REST}/api/search/${encodeURIComponent(q)}`);
  const data = await r.json();
  const ms = Math.round(performance.now() - t0);
  renderVideoCards(data.videos || []);
  logWire({ method: "GET", endpoint: `/api/search/${q}`, grpcHop: "video.VideoService/SearchVideos", kafkaTopic: "read-only", ms, payload: data });
}

function renderVideoCards(videos) {
  const listEl = document.getElementById("video-list");
  if (!videos.length) {
    listEl.innerHTML = `
      <div class="col-span-full rounded-xl border border-dashed border-slate-700 p-6 text-center space-y-2">
        <p class="text-xs text-slate-300 font-semibold">No videos found in SQLite database yet.</p>
        <p class="text-xs text-slate-400">Click <span class="text-amber-400 font-bold">+ Seed Sample Catalog (gRPC)</span> above to create 3 demo entries via VideoService gRPC.</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = videos.map((v) => {
    const active = selectedVideo && String(selectedVideo.id) === String(v.id);
    return `
      <button onclick='selectVideo(${JSON.stringify(v).replace(/'/g, "&#39;")})' class="text-left panel-soft rounded-xl p-3.5 hover:border-red-500/70 transition-all ${active ? "ring-2 ring-red-500 border-red-500" : ""}">
        <div class="flex items-center justify-between gap-2 mb-1.5">
          <span class="px-2 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/30 text-[10px] font-mono-code font-bold">${escapeHtml(v.category || "Stream")}</span>
          <span class="text-[11px] font-mono-code text-slate-400">#${v.id}</span>
        </div>
        <div class="font-bold text-sm text-white truncate">${escapeHtml(v.title)}</div>
        <div class="text-xs text-slate-400 line-clamp-2 mt-1">${escapeHtml(v.description || "Streaming microservice asset")}</div>
        <div class="flex items-center gap-3 mt-2.5 text-[11px] font-mono-code text-slate-300">
          <span>&#9654; ${v.views || 0} views</span>
          <span>&#9829; ${v.likes || 0} likes</span>
        </div>
      </button>
    `;
  }).join("");

  if (!selectedVideo && videos.length) {
    selectVideo(videos[0]);
  }
}

async function selectVideo(v) {
  selectedVideo = v;
  document.getElementById("sel-title").textContent = v.title;
  document.getElementById("sel-meta").textContent = `ID: ${v.id} • Likes: ${v.likes || 0} • Views: ${v.views || 0}`;
  document.getElementById("btn-like").disabled = false;
  document.getElementById("btn-comment").disabled = false;

  const stage = document.getElementById("player-stage");
  const mediaSrc = v.filename && v.filename !== "sample-stream.mp4"
    ? `${VIDEO_HTTP}/uploads/${encodeURIComponent(v.filename)}`
    : "";

  stage.innerHTML = mediaSrc
    ? `<video controls class="w-full max-h-60 rounded-lg bg-black" src="${mediaSrc}"></video>
       <div class="mt-2 text-[11px] font-mono-code text-slate-400">Direct media stream from Video Service (${escapeHtml(mediaSrc)})</div>`
    : `<div class="w-full py-4 space-y-2">
         <div class="w-12 h-12 mx-auto rounded-full bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-400 font-bold text-lg">&#9654;</div>
         <div class="text-sm font-bold text-white">${escapeHtml(v.title)}</div>
         <div class="text-xs text-slate-400 max-w-md mx-auto">${escapeHtml(v.description || "")}</div>
         <div class="text-[11px] font-mono-code text-amber-300">gRPC Metadata Record • filepath: ${escapeHtml(v.filepath || "/uploads/stream")}</div>
       </div>`;

  await loadCommentsForSelected();
}

async function loadCommentsForSelected() {
  if (!selectedVideo) return;
  const t0 = performance.now();
  const query = `query($vid: String!) { getVideoComments(videoId: $vid) { id userId content } }`;
  const r = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { vid: String(selectedVideo.id) } })
  });
  const data = await r.json();
  const ms = Math.round(performance.now() - t0);
  const comments = (data.data && data.data.getVideoComments) || [];
  const box = document.getElementById("comments-box");
  box.innerHTML = `
    <div class="text-xs font-mono-code text-slate-400">Comments via GraphQL + Interaction gRPC (${comments.length})</div>
    ${comments.length ? comments.map((c) => `
      <div class="rounded-lg bg-slate-900/90 border border-slate-800 px-3 py-2 text-xs flex justify-between gap-2">
        <span class="text-slate-200"><b class="text-amber-300">${escapeHtml(c.userId)}:</b> ${escapeHtml(c.content)}</span>
        <span class="font-mono-code text-slate-500">#${c.id}</span>
      </div>
    `).join("") : '<div class="text-xs text-slate-500">No comments yet — post one above to fire a gRPC + Kafka event!</div>'}
  `;
  logWire({ method: "POST", endpoint: "GraphQL getVideoComments", grpcHop: "interaction.InteractionService/GetComments", kafkaTopic: "read-only", ms, payload: data });
}

async function likeSelectedVideo() {
  if (!selectedVideo) return;
  const t0 = performance.now();
  const r = await fetch(`${GATEWAY_REST}/api/like`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoId: String(selectedVideo.id), userId: `${activeUserId}-${Date.now()}` })
  });
  const data = await r.json();
  const ms = Math.round(performance.now() - t0);
  logWire({ method: "POST", endpoint: "/api/like", grpcHop: "interaction.InteractionService/LikeVideo", kafkaTopic: "video.liked", ms, payload: data });
  if (data.totalLikes !== undefined) {
    document.getElementById("sel-meta").textContent = `ID: ${selectedVideo.id} • Interaction Likes: ${data.totalLikes}`;
  }
}

async function addCommentToSelected() {
  if (!selectedVideo) return;
  const inp = document.getElementById("comment-input");
  const content = inp.value.trim();
  if (!content) return;
  const t0 = performance.now();
  const r = await fetch(`${GATEWAY_REST}/api/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoId: String(selectedVideo.id), userId: activeUserId, content })
  });
  const data = await r.json();
  const ms = Math.round(performance.now() - t0);
  inp.value = "";
  logWire({ method: "POST", endpoint: "/api/comments", grpcHop: "interaction.InteractionService/AddComment", kafkaTopic: "comment.added", ms, payload: data });
  await loadCommentsForSelected();
}

async function createVideo() {
  const title = document.getElementById("new-title").value.trim() || `SOA Architecture Walk #${Math.floor(Math.random() * 90 + 10)}`;
  const category = document.getElementById("new-cat").value.trim() || "Distributed Systems";
  const description = document.getElementById("new-desc").value.trim() || "gRPC + Kafka streaming microservice demonstration record.";
  const t0 = performance.now();
  const r = await fetch(`${GATEWAY_REST}/api/videos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, category, description })
  });
  const data = await r.json();
  const ms = Math.round(performance.now() - t0);
  document.getElementById("new-title").value = "";
  document.getElementById("new-desc").value = "";
  logWire({ method: "POST", endpoint: "/api/videos", grpcHop: "video.VideoService/CreateVideo", kafkaTopic: "video.uploaded", ms, payload: data });
  await loadVideos(lastMode);
}

async function seedSampleVideos() {
  const samples = [
    { title: "GraphQL Federation Over gRPC Mesh", category: "Architecture", description: "Apollo Server 4 federating REST and binary Protobuf calls across 3 autonomous bounded contexts." },
    { title: "Apache Kafka Event Choreography", category: "Streaming", description: "Asynchronous video.uploaded, video.liked, and comment.added topics with non-blocking fallback." },
    { title: "Distributed SQLite & RxDB Persistence", category: "Storage", description: "Polyglot datastore isolation per microservice container with JWT authentication." }
  ];
  for (const s of samples) {
    await fetch(`${GATEWAY_REST}/api/videos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s)
    });
  }
  await loadVideos(lastMode);
}

async function registerUser() {
  const username = document.getElementById("auth-user").value.trim();
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-pass").value;
  const t0 = performance.now();
  const r = await fetch(`${GATEWAY_REST}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password })
  });
  const data = await r.json();
  const ms = Math.round(performance.now() - t0);
  if (data.user_id) activeUserId = username;
  document.getElementById("auth-status").textContent = data.success ? `Registered (${username})` : "Exists -> Login";
  logWire({ method: "POST", endpoint: "/api/register", grpcHop: "user.UserService/Register", kafkaTopic: "user.created", ms, payload: data });
}

async function loginUser() {
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-pass").value;
  const t0 = performance.now();
  const r = await fetch(`${GATEWAY_REST}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = await r.json();
  const ms = Math.round(performance.now() - t0);
  if (data.success && data.user_id) {
    activeUserId = data.user_id.slice(0, 12);
    document.getElementById("auth-status").textContent = "JWT Active";
    document.getElementById("auth-status").className = "text-[11px] font-mono-code text-emerald-400 font-bold";
  }
  logWire({ method: "POST", endpoint: "/api/login", grpcHop: "user.UserService/Login", kafkaTopic: "auth.jwt.issued", ms, payload: data });
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
