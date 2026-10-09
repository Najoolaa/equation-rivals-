# Equation Rivals

A **real-time multiplayer strategy game** for two people on separate devices. Both use the same mathematical equation while completing different creative missions: the Artist builds a colorful mosaic, and the Architect builds a miniature city. Players secretly predict the opponent's next tile in order to block it.

## Rules (also built into the game's How to Play screen)

1. Create a room and invite a second player using the six-character code or invite link. Only two players can join a game.
2. Player 1 is **the Artist** (a 9-tile artwork). Player 2 is **the Architect** (a 9-tile city). Both see both boards and may choose any unfinished tile on their own board.
3. **Both use `y = (3x + 2) mod 7`**, where `mod 7` means the remainder on division by seven. Each unfinished tile is labeled with a target `y`. Choose an integer `x` from 0 through 6 that gives that target. Example: x=2 gives y=8 mod 7 = 1.
4. Before submitting, optionally predict which unfinished *unprotected* tile your opponent will choose this turn.
5. Moves are committed secretly, then revealed simultaneously when **both** players have submitted. Correct math places the selected tile. Incorrect math does not. If an opponent correctly predicts your selected tile and it is not protected, your placement is blocked even if your math is correct.
6. A blocked tile receives a permanent **shield**, and can never be blocked again; on a future round, correct math will place it. This prevents deadlocks.
7. First player to fill all nine tiles wins. If both finish during the same reveal, it's a draw. After a match, both may agree to a rematch.

## Run locally

Requires Node.js 20 or newer. No dependencies, API keys, or external accounts needed.

```bash
npm start
```

Open **http://localhost:3000** in two separate browser sessions that do not share the same saved data (for example, one normal and one private/incognito session), create a room in one session and join with the code in the other. To play from two phones on the same Wi-Fi, use the host computer's LAN IP and port 3000 (check firewall access).

Run tests:

```bash
npm test
```

## Publish at a public URL (Render)

1. Unzip this project. Create a GitHub repository and upload the **contents** of this folder (including `server.js`, `package.json`, `render.yaml` and `public/`).
2. Sign in to [Render](https://dashboard.render.com/) and choose **New → Web Service**; connect the GitHub repository.
3. Set the build command to `npm install`, start command to `npm start`, and select a plan (Free is sufficient for a demo, if available). The service should listen to the `PORT` provided by Render; this project does so automatically.
4. After deployment, copy the `https://<name>.onrender.com` address and open it from two separate devices. Create a room, copy the invite link, and share it.

You can also use Render **Blueprints** with the included `render.yaml` file.

**Limitations of this first version:** Live rooms are held in one server process's memory, so a restart, redeployment or free-instance spin-down can reset ongoing matches. Don't scale to multiple server instances. Rooms without connected clients expire after about 12 hours without a move. A production version should use persistent storage (e.g. Postgres / Supabase) and reconnect/recovery policies. No registration or authentication beyond unguessable room/session tokens; avoid sharing invite links publicly.

## Tech

- Vanilla HTML, CSS, and JavaScript, responsive on desktop and phones.
- Node.js built-in HTTP server; no framework or npm runtime dependencies.
- **Server-Sent Events (SSE)** deliver state changes live to both browsers as moves are locked/revealed. HTTP POST endpoints submit validated moves.
- Game rules and state transitions live on the server (`engine.js`). Players' secret predictions stay server-side until both commit.
- Server uses random session tokens stored in the player's browser for reload/reconnect.

## Files

`server.js` = HTTP routes + events; `engine.js` = authoritative game logic; `public/index.html` = UI + rules; `public/app.js` = browser logic; `public/style.css` = styling; `test/engine.test.js` = rule tests; `render.yaml` = sample deployment blueprint.
