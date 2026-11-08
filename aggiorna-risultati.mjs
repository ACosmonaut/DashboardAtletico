import fs from 'node:fs';

const source = 'https://fip.it/risultati/?group=campionati-regionali&regione_codice=LA&comitato_codice=RLA&codice_fase=1';
const competitions = [
  {id:'basket-b-f', sex:'F', code:'B/F', group:'85325', rounds:11},
  {id:'basket-c-f', sex:'F', code:'C/F', group:'85928', rounds:9},
  {id:'basket-dr2-m', sex:'M', code:'PM', group:'86118', rounds:9},
  {id:'basket-u14-f', sex:'F', code:'U14/F', group:'86289', rounds:9},
];
const dashboard = fs.readFileSync('Dashboard_Atletico_San_Lorenzo_2026-27.html', 'utf8');
const fixtures = JSON.parse(dashboard.match(/^window\.ATLETICO_DATA = (.*);$/m)[1]).partite
  .filter(game => competitions.some(competition => competition.id === game.squadra));
const file = 'risultati.json';
const results = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
const aliases = new Map([
  ['luiss roma', 'luiss'],
  ['bull basket latina', 'bull basket'],
  ['gs esquilino roma', 'esquilino basketball'],
]);
function team(value) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return aliases.get(normalized) ?? normalized;
}

const months = 'gennaio febbraio marzo aprile maggio giugno luglio agosto settembre ottobre novembre dicembre'.split(' ');
async function readPages() {
  if (process.argv.length > 2) return process.argv.slice(2).map(path => {
    const html = fs.readFileSync(path, 'utf8');
    const group = html.match(/codice_girone=(\d+)&codice_ar=/)?.[1];
    const competition = competitions.find(item => item.group === group);
    if (!competition) throw new Error('Girone FIP sconosciuto: ' + path);
    return {html, competition};
  });
  const pages = [];
  for (const competition of competitions) {
    for (const leg of [1, 0]) {
      for (let round = 1; round <= competition.rounds; round++) {
        const response = await fetch(source + '&sesso=' + competition.sex + '&codice_campionato=' + encodeURIComponent(competition.code) + '&codice_girone=' + competition.group + '&codice_ar=' + leg + '&giornata=' + round,
          {signal: AbortSignal.timeout(15000)});
        if (!response.ok) throw new Error('FIP HTTP ' + response.status);
        const html = await response.text();
        if (!html.includes('results-matches__match')) throw new Error('Pagina FIP senza tabellone: ' + leg + '/' + round);
        pages.push({html, competition});
      }
    }
  }
  return pages;
}

const matched = new Map();
const ambiguous = new Set();
const pages = await readPages();
for (const {row, competition} of pages.flatMap(({html, competition}) => html.split('<div class="results-matches__match">').slice(1).map(row => ({row, competition})))) {
  const teams = Array.from(row.matchAll(/class="team__name">\s*([^<]+)<\/div>/g), m => m[1].trim());
  const scores = Array.from(row.matchAll(/class="team__points">\s*(\d{1,3})\s*<\/div>/g), m => Number(m[1]));
  const date = row.match(/class="date">\s*(\d{1,2})\s+(\w+)\s+(2026|2027)\s*<\/div>/i);
  if (teams.length < 2 || scores.length !== 2 || scores[0] === scores[1] || !date) continue;
  const [home, away] = teams;
  if (![home, away].some(name => team(name) === 'atletico san lorenzo')) continue;
  const month = months.indexOf(date[2].toLowerCase()) + 1;
  if (!month) continue;
  const iso = date[3] + '-' + String(month).padStart(2, '0') + '-' + date[1].padStart(2, '0');
  const points = scores;
  const candidates = fixtures.filter(game => game.squadra === competition.id && game.data === iso &&
    team(game.casa) === team(home) && team(game.ospite) === team(away));
  if (candidates.length !== 1) {
    console.warn('Gara da verificare:', iso, home, away);
    continue;
  }
  const game = candidates[0];
  if (matched.has(game.id) && String(matched.get(game.id)) !== String(points)) ambiguous.add(game.id);
  matched.set(game.id, points);
}
for (const id of ambiguous) matched.delete(id);
if (!matched.size) throw new Error('Nessun risultato abbinato: file precedente conservato');
for (const [id, points] of matched) {
  const game = fixtures.find(item => item.id === id);
  if (game.puntiCasa != null && (game.puntiCasa !== points[0] || game.puntiOspite !== points[1])) {
    console.warn('Punteggio discordante dal dato iniziale:', id);
    continue;
  }
  results[id] = points;
}
console.log(matched.size + ' gare abbinate, ' + Object.keys(results).length + ' risultati disponibili');
fs.writeFileSync(file, JSON.stringify(results, null, 2) + '\n');

