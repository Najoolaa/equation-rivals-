'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { makeRoom, joinRoom, getRole, submitMove, rematch, snapshot } = require('./engine');

const PORT = Number(process.env.PORT || 3000);
const rooms = new Map();
const streams = new Map();
const PUBLIC_DIR = path.join(__dirname, 'public');
const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
};
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
function err(res, status, message) { json(res, status, { error: message }); }
function roomCode() {
  let code;
  do { code = Array.from(crypto.randomBytes(6)).map(b => LETTERS[b % LETTERS.length]).join(''); }
  while (rooms.has(code));
  return code;
}
function token() { return crypto.randomBytes(24).toString('hex'); }
function validName(name) {
  if (typeof name !== 'string') return null;
  const cleaned = name.trim().replace(/\s+/g, ' ').slice(0, 24);
  return cleaned.length >= 1 ? cleaned : null;
}
function input(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 8192) { reject(new Error('Request is too large.')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch { reject(new Error('Invalid JSON.')); }
    });
    req.on('error', reject);
  });
}
function sendState(room) {
  for (const stream of streams.get(room.code) || []) {
    if (stream.res.destroyed || stream.res.writableEnded) continue;
    stream.res.write(`event: state\ndata: ${JSON.stringify(snapshot(room, stream.role))}\n\n`);
  }
}
function auth(code, accessToken) {
  const room = rooms.get(code);
  const role = room && getRole(room, accessToken);
  return room && role ? { room, role } : null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && FILES[url.pathname]) {
    const [file, type] = FILES[url.pathname];
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': file === 'index.html' ? 'no-cache' : 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(path.join(PUBLIC_DIR, file)).pipe(res);
    return;
  }
  if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true });
  if (req.method === 'POST' && url.pathname === '/api/rooms') {
    try {
      const body = await input(req);
      const name = validName(body.name);
      if (!name) return err(res, 400, 'Enter your name to create a room.');
      const code = roomCode();
      const accessToken = token();
      const room = makeRoom(code, name, accessToken);
      rooms.set(code, room);
      return json(res, 201, { code, token: accessToken, role: 'artist', state: snapshot(room, 'artist') });
    } catch (e) { return err(res, 400, e.message); }
  }
  const match = url.pathname.match(/^\/api\/rooms\/([A-HJ-NP-Z2-9]{6})(?:\/(join|events|submit|rematch))?$/);
  if (!match) return err(res, 404, 'Not found.');
  const [, code, action] = match;
  if (req.method === 'POST' && action === 'join') {
    const room = rooms.get(code);
    if (!room) return err(res, 404, 'No game found with that room code.');
    try {
      const body = await input(req);
      const name = validName(body.name);
      if (!name) return err(res, 400, 'Enter your name to join.');
      const accessToken = token();
      joinRoom(room, name, accessToken);
      sendState(room);
      return json(res, 200, { code, token: accessToken, role: 'architect', state: snapshot(room, 'architect') });
    } catch (e) { return err(res, 400, e.message); }
  }
  const accessToken = req.method === 'GET' ? url.searchParams.get('token') : null;
  if (req.method === 'GET' && (!action || action === 'events')) {
    const session = auth(code, accessToken);
    if (!session) return err(res, 401, 'Game session not found. Join or create a room.');
    if (!action) return json(res, 200, snapshot(session.room, session.role));
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    if (!streams.has(code)) streams.set(code, new Set());
    const client = { res, role: session.role };
    streams.get(code).add(client);
    req.on('close', () => streams.get(code)?.delete(client));
    res.write(`event: state\ndata: ${JSON.stringify(snapshot(session.room, session.role))}\n\n`);
    return;
  }
  if (req.method === 'POST' && (action === 'submit' || action === 'rematch')) {
    try {
      const body = await input(req);
      const session = auth(code, body.token);
      if (!session) return err(res, 401, 'Your session expired. Rejoin a new room.');
      if (action === 'submit') submitMove(session.room, session.role, body);
      else rematch(session.room, session.role);
      sendState(session.room);
      return json(res, 200, snapshot(session.room, session.role));
    } catch (e) { return err(res, 400, e.message); }
  }
  return err(res, 405, 'Method not allowed.');
});

const heartbeat = setInterval(() => {
  const now = Date.now();
  for (const [code, clients] of streams) {
    for (const client of clients) {
      if (client.res.destroyed || client.res.writableEnded) clients.delete(client);
      else client.res.write(': heartbeat\n\n');
    }
    if (!clients.size) streams.delete(code);
  }
  for (const [code, room] of rooms) {
    if (now - room.updatedAt > 12 * 60 * 60 * 1000 && !streams.has(code)) rooms.delete(code);
  }
}, 20000);
heartbeat.unref();

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => console.log(`Equation Rivals listening on ${PORT}`));
}
module.exports = { server };
