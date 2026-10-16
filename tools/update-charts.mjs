// Refreshes charts.json from 17 official Spotify genre playlists.
// Runs in GitHub Actions (Node 20+, no dependencies). Writes the file only when a playlist actually changed,
// so the site's "last change" time and the git history both mean "the playlists moved".
import { readFile, writeFile } from "node:fs/promises";

const FILE = new URL("../charts.json", import.meta.url);
const TOP = 50;
const PLAYLISTS = [
  ["pop", "Pop", "37i9dQZF1DXcBWIGoYBM5M"],
  ["hiphop", "Hip-Hop", "37i9dQZF1DX0XUsuxWHRQd"],
  ["rnb", "R&B", "37i9dQZF1DX4SBhb3fqCJd"],
  ["electronic", "Electronic", "37i9dQZF1DX4dyzvuaRJ0n"],
  ["dance", "Dance", "37i9dQZF1DX8tZsk68tuDw"],
  ["kpop", "K-Pop", "37i9dQZF1DX9tPFwDMOaN1"],
  ["jpop", "J-Pop", "37i9dQZF1DXafb0IuPwJyF"],
  ["latin", "Latin", "37i9dQZF1DX10zKzsJ2jva"],
  ["reggaeton", "Reggaeton", "37i9dQZF1DWY7IeIP1cdjF"],
  ["funk", "Brazilian Funk", "37i9dQZF1DWTkIwO2HDifB"],
  ["afro", "Afrobeats", "37i9dQZF1DWYkaDif7Ztbp"],
  ["hindi", "Bollywood", "37i9dQZF1DX0XUfTFmNBRM"],
  ["country", "Country", "37i9dQZF1DX1lVhptIYRda"],
  ["alt", "Alternative", "37i9dQZF1DWVqJMsgEN0F4"],
  ["rock", "Rock", "37i9dQZF1DXcF6B6QPhFDv"],
  ["metal", "Metal", "37i9dQZF1DWTcqUzwhNmKv"],
  ["hyperpop", "Hyperpop", "37i9dQZF1DX7HOk71GPfSw"],
];

async function fetchPlaylist(pid) {
  const res = await fetch(`https://open.spotify.com/embed/playlist/${pid}`, {
    headers: { "user-agent": "Mozilla/5.0 (DoTheDance chart updater; +https://github.com/serenan1206-cpu/Do-the-dance)", "accept-language": "en" },
  });
  if (!res.ok) throw new Error(`${pid}: HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error(`${pid}: no embed data`);
  const e = JSON.parse(m[1]).props.pageProps.state.data.entity;
  return {
    name: e.name.trim(),
    tracks: e.trackList.slice(0, TOP).map((t) => ({ t: t.title, a: (t.subtitle || "").replace(/ /g, " "), id: t.uri.split(":")[2] })),
  };
}

const today = new Date().toISOString().slice(0, 10);
let prev = null;
try { prev = JSON.parse(await readFile(FILE, "utf8")); } catch {}
const prevById = Object.fromEntries((prev?.charts || []).map((c) => [c.id, c]));

let changed = !prev;
const charts = [];
for (const [id, genre, pid] of PLAYLISTS) {
  const old = prevById[id];
  let fresh;
  try { fresh = await fetchPlaylist(pid); }
  catch (err) {
    console.warn("keep previous:", err.message);
    if (old) { charts.push(old); continue; }
    throw err;
  }
  const oldPos = new Map((old?.tracks || []).map((t) => [t.id, t]));
  const sameOrder = old && old.tracks.length === fresh.tracks.length && old.tracks.every((t, i) => t.id === fresh.tracks[i].id);
  if (sameOrder) { charts.push({ ...old, name: fresh.name }); continue; }
  changed = true;
  charts.push({
    id, genre, name: fresh.name, pid,
    tracks: fresh.tracks.map((t, i) => {
      const o = oldPos.get(t.id);
      // p: rank before this change (null = new entry). Left out entirely on the very first snapshot.
      const row = { r: i + 1, t: t.t, a: t.a, id: t.id, since: o?.since || today };
      if (old) row.p = o ? o.r : null;
      return row;
    }),
  });
}

if (!changed) { console.log("No playlist changed."); process.exit(0); }
await writeFile(FILE, JSON.stringify({ updated: new Date().toISOString(), charts }, null, 0) + "\n");
console.log("charts.json updated.");
