# Last Nation Standing

A single-file, offline world dice-conquest game (`index.html`) — 176 countries, a compass,
dice battles and flag-by-flag annexation. English / فارسی, with sound and speed controls.

Open `index.html` in a browser, or run a local server:

```bash
npm install      # only needed for the test harness
npm start        # http://localhost:8000
```

## Rule

Each round a random nation picks a compass direction, attacks the neighbour it points
at, and rolls dice. The winner of the battle hoists its flag over the loser — **and over
everything the loser owned**. The match ends when one nation owns the whole map.

## The annexation fix

The map data shipped four island groups with no land border to anything
(Cuba–Bahamas–Jamaica, Hispaniola–Puerto Rico, Fiji–Vanuatu–New Caledonia–New Zealand).
Since a battle can only be fought against a neighbour, those islands formed closed
worlds of their own: they could never be attacked and never attack, so **every match
stopped at `Countries Left: 4`** and crowned a winner while four nations were still
standing.

What `index.html` now does:

* **Sea routes** — three straits are registered as borders (Haiti–Cuba, USA–The Bahamas,
  Vanuatu–Solomon Islands), so the world graph is a single connected map and the last
  annexations can actually happen. A land border is still preferred over a sea route.
* **Auto-bridge** — if the graph ever splits again (data edit, new country), the closest
  pair of disconnected lands is joined at runtime, and a stalemate inside a running
  match is bridged instead of ending the game early.
* **Counter from the map** — `Countries Left` is recounted from the realms, so it can
  never drift away from what is drawn.
* **Compass truth** — the arrow always points at the country that is actually attacked.
* **Sea lanes** — a target reachable only across water gets a dashed lane on the sea and
  a "by sea" note (از راه دریا) in the direction panel.
* **Big collapses** — when an empire hands over more than ten lands at once the
  annexation is one synchronised wave instead of dozens of camera stops, so one battle
  no longer stalls the match for half a minute.

## Tools

```bash
node tools/extract-data.js   # pull the map DATA out of index.html → tools/data.json
node tools/seaLinks.js       # find the gaps / shortest sea crossings in the world graph
npm test                     # plays a whole match in jsdom and checks it ends at 1
```
