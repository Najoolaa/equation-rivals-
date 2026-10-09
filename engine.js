'use strict';

const ROLES = ['artist', 'architect'];
const TARGETS = Object.freeze({
  artist: Object.freeze([1, 5, 2, 6, 0, 4, 3, 2, 5]),
  architect: Object.freeze([4, 2, 6, 1, 5, 3, 0, 4, 1]),
});
const TOTAL = TARGETS.artist.length;

function formula(x) {
  return ((3 * x + 2) % 7 + 7) % 7;
}

function newPlayer(name, token, role) {
  return { name, token, role, filled: [], guarded: [], ready: false };
}

function makeRoom(code, name, token) {
  return {
    code,
    status: 'waiting',
    round: 1,
    players: { artist: newPlayer(name, token, 'artist'), architect: null },
    moves: {},
    lastRound: null,
    winner: null,
    updatedAt: Date.now(),
  };
}

function joinRoom(room, name, token) {
  if (room.status !== 'waiting' || room.players.architect) throw new Error('This room is already full.');
  room.players.architect = newPlayer(name, token, 'architect');
  room.status = 'playing';
  room.updatedAt = Date.now();
}

function getRole(room, token) {
  if (typeof token !== 'string') return null;
  return ROLES.find(role => room.players[role]?.token === token) || null;
}

function isIntInRange(value, low, high) {
  return Number.isInteger(value) && value >= low && value <= high;
}

function isUnfilled(player, tile) {
  return isIntInRange(tile, 0, TOTAL - 1) && !player.filled.includes(tile);
}

function submitMove(room, role, move) {
  if (room.status !== 'playing') throw new Error('The round is not open for moves.');
  if (!ROLES.includes(role)) throw new Error('Unknown player.');
  if (room.moves[role]) throw new Error('Your move is already locked in.');
  if (!move || !isUnfilled(room.players[role], move.tile)) {
    throw new Error('Choose an unfinished square on your board.');
  }
  if (!isIntInRange(move.x, 0, 6)) throw new Error('Choose an input x between 0 and 6.');
  const rival = room.players[ROLES.find(r => r !== role)];
  if (move.prediction !== null && move.prediction !== undefined && !isUnfilled(rival, move.prediction)) {
    throw new Error('Predict an unfinished square on your opponent’s board, or pass.');
  }
  room.moves[role] = {
    tile: move.tile,
    x: move.x,
    prediction: move.prediction ?? null,
  };
  room.updatedAt = Date.now();
  if (room.moves.artist && room.moves.architect) resolveRound(room);
}

function resolveRound(room) {
  const results = {};
  for (const role of ROLES) {
    const me = room.players[role];
    const rivalRole = ROLES.find(r => r !== role);
    const action = room.moves[role];
    const opponent = room.moves[rivalRole];
    const target = TARGETS[role][action.tile];
    const output = formula(action.x);
    let outcome;
    if (output !== target) {
      outcome = 'wrong';
    } else if (opponent.prediction === action.tile && !me.guarded.includes(action.tile)) {
      outcome = 'blocked';
      me.guarded.push(action.tile);
    } else {
      outcome = 'built';
      me.filled.push(action.tile);
    }
    results[role] = { ...action, target, output, outcome };
  }
  room.lastRound = { number: room.round, results };
  const artistDone = room.players.artist.filled.length === TOTAL;
  const architectDone = room.players.architect.filled.length === TOTAL;
  if (artistDone || architectDone) {
    room.status = 'finished';
    room.winner = artistDone && architectDone ? 'draw' : artistDone ? 'artist' : 'architect';
  } else {
    room.round += 1;
  }
  room.moves = {};
  room.updatedAt = Date.now();
}

function rematch(room, role) {
  if (room.status !== 'finished') throw new Error('Finish this match before requesting a rematch.');
  room.players[role].ready = true;
  if (ROLES.every(r => room.players[r].ready)) {
    for (const r of ROLES) {
      room.players[r].filled = [];
      room.players[r].guarded = [];
      room.players[r].ready = false;
    }
    room.round = 1;
    room.status = 'playing';
    room.lastRound = null;
    room.moves = {};
    room.winner = null;
  }
  room.updatedAt = Date.now();
}

function snapshot(room, viewerRole) {
  return {
    code: room.code,
    status: room.status,
    round: room.round,
    you: viewerRole,
    winner: room.winner,
    targets: TARGETS,
    total: TOTAL,
    players: Object.fromEntries(ROLES.map(role => [role, room.players[role] ? {
      name: room.players[role].name,
      filled: room.players[role].filled,
      guarded: room.players[role].guarded,
      locked: Boolean(room.moves[role]),
      ready: room.players[role].ready,
    } : null])),
    lastRound: room.lastRound,
  };
}

module.exports = { ROLES, TARGETS, TOTAL, formula, makeRoom, joinRoom, getRole, submitMove, rematch, snapshot };
