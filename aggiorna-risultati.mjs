import fs from 'node:fs';

const source = 'https://fip.it/risultati/?group=campionati-regionali&regione_codice=LA&comitato_codice=RLA&codice_fase=1';
const competitions = [
  {id:'basket-b-f', sex:'F', code:'B/F', group:'85325', rounds:11},
  {id:'basket-c-f', sex:'F', code:'C/F', group:'85928', rounds:9},
  {id:'basket-dr2-m', sex:'M', code:'PM', group:'86118', rounds:9},
  {id:'basket-u14-f', sex:'F', code:'U14/F', group:'86289', rounds:9},
];
const football = [
  {id:'calcio-seconda', code:'2C', group:'E'},
  {id:'c5-serie-c-f', code:'F5', group:'A'},
  {id:'c5-u15-f', code:'47', group:'B'},
];
const calcio8 = {id:'c8-serie-b', endpoint:'https://www.legacalcioa8.it/system/include/ajax/public/league.php'};
const csi = {
  id:'c5-csi-f',
  link:'https://live.centrosportivoitaliano.it/26/Calcio-a-5/Lazio/Roma/C36497/?j=NEU9REREJjRGPVBOUCY0Rz1HSkhNSyY0SD1GTEtJSkQmNEk9VHY0MTByIGgwdnAxJjRMPURERCY0Mj1l'
};
const dashboard = fs.readFileSync('Dashboard_Atletico_San_Lorenzo_2026-27.html', 'utf8');
const data = JSON.parse(dashboard.match(/^window\.ATLETICO_DATA = (.*);$/m)[1]);
for (const [id, link] of Object.entries(data.lndYouthSources ?? {})) {
  const url = new URL(link);
  football.push({id, code:url.searchParams.get('campionato'), group:url.searchParams.get('girone'), link});
}
const fixtures = data.partite
  .filter(game => [...competitions, ...football, csi, calcio8].some(competition => competition.id === game.squadra));
const file = 'risultati.json';
const results = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
const aliases = new Map([
  ['agrimoderna jungle team palest', 'agrimoderna jungle team palestrina'],
  ['liberi nantes a s d', 'liberi nantes'],
  ['olimpus tiburtina roma', 'olimpus tiburtina'],
  ['asd fc truppian', 'fc truppian'],
  ['luiss roma', 'luiss'],
  ['bull basket latina', 'bull basket'],
  ['gs esquilino roma', 'esquilino basketball'],
  ['oxygene a s d', 'oxygene asd'],
  ['a p d ordine ingegnari di roma', 'ordine ingegneri di roma'],
  ['asd progetto futsal calcio a 5', 'progetto futsal calcio a 5'],
  ['united s lorenzo castelf', 'united s lorenzo castelforte'],
]);
function team(value) {
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return aliases.get(normalized) ?? normalized;
}

const months = 'gennaio febbraio marzo aprile maggio giugno luglio agosto settembre ottobre novembre dicembre'.split(' ');
async function readPages() {
  if (process.argv.length > 2) return process.argv.slice(2).filter(path => !path.startsWith("--lnd=") && !path.startsWith("--csi=")).map(path => {
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
let pages;
try {
  pages = await readPages();
} catch (error) {
  if (process.argv.length > 2) throw error;
  console.warn('FIP: ' + error.message + '. Conservati i punteggi precedenti.');
  pages = [];
}
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
  record(competition, iso, home, away, points);
}
function record(competition, iso, home, away, points, lndId) {
  const candidates = fixtures.filter(game => game.squadra === competition.id &&
    (game.lndId != null ? game.lndId === lndId && team(game.casa) === team(home) && team(game.ospite) === team(away) :
      game.data === iso && team(game.casa) === team(home) && team(game.ospite) === team(away)));
  if (candidates.length !== 1) {
    console.warn('Gara da verificare:', iso, home, away);
    return;
  }
  const game = candidates[0];
  if (matched.has(game.id) && String(matched.get(game.id)) !== String(points)) ambiguous.add(game.id);
  matched.set(game.id, points);
}
function lndPage(html) {
  const data = html.match(/<script data-page="app" type="application\/json">([\s\S]*?)<\/script>/);
  if (!data) throw new Error('Dati LND assenti');
  return JSON.parse(data[1]).props;
}
async function loadLnd(url) {
  const response = await fetch(url, {signal: AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error('LND HTTP ' + response.status);
  return lndPage(await response.text());
}
function importLnd(page, competition) {
  if (page.season !== 2026 || page.championship?.code !== competition.code ||
      page.group?.code !== competition.group || !Array.isArray(page.matches)) {
    throw new Error('Giornata LND inattesa: ' + competition.id);
  }
  for (const game of page.matches) {
    if (!game.isPlayed || game.isLive || game.isRest ||
        ![game.home, game.away].includes('ATLETICO SAN LORENZO')) continue;
    const score = [game.homeGoals, game.awayGoals];
    if (score.every(value => Number.isInteger(value) && value >= 0)) {
      record(competition, game.date, game.home, game.away, score, game.id);
    }
  }
}
const today = new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Rome'}).format(new Date());

async function updateFromStadiro() {
  const pending = fixtures.filter(game => game.squadra === 'calcio-seconda' &&
    game.data <= today && game.puntiCasa == null && !Object.hasOwn(results, game.id) &&
    !matched.has(game.id));
  if (!pending.length) return;

  const url = 'https://stadiro.com/leagues/italy/seconda-categoria-lazio/results/';
  const response = await fetch(url, {signal: AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const html = await response.text();
  const englishMonths = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
  const normalizeName = name => team(name)
    .replace(/^(?:pol )?(?:com|comunale) monteflavio$/, 'comunale monteflavio');
  for (const [, item] of html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const row = item.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/&ndash;|&#8211;/gi, '–').replace(/&middot;|&#183;/gi, '·')
      .replace(/\s+/g, ' ').trim();
    const score = row.match(/^(.+?)\s+(\d{1,2})\s*[–-]\s*(\d{1,2})\s+(.+?)\s*·\s*(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})$/);
    if (!score) continue;
    const [, home, homeGoals, awayGoals, away, day, month, year] = score;
    const monthNumber = englishMonths.indexOf(month) + 1;
    if (!monthNumber) continue;
    const date = year + '-' + String(monthNumber).padStart(2, '0') + '-' + day.padStart(2, '0');
    const games = pending.filter(game => game.data === date &&
      normalizeName(game.casa) === normalizeName(home) &&
      normalizeName(game.ospite) === normalizeName(away));
    if (games.length !== 1) continue;
    const [{id}] = games;
    const points = [Number(homeGoals), Number(awayGoals)];
    if (matched.has(id) && String(matched.get(id)) !== String(points)) ambiguous.add(id);
    matched.set(id, points);
  }
}

function importCsi(html) {
  if (!html.includes('/26/Calcio-a-5/Lazio/Roma/C36497/') || !html.includes('Atletico San Lorenzo')) {
    throw new Error('Girone CSI inatteso');
  }
  for (const [, card] of html.matchAll(/<a\b[^>]*class="btn btn-gara"[^>]*>([\s\S]*?)<\/a>/g)) {
    const names = [...card.matchAll(/class="nome-squadra">\s*([^<]+)</g)].map(match => match[1].trim());
    if (names.length !== 2 || !names.some(name => team(name) === 'atletico san lorenzo')) continue;
    const date = card.match(/<span>\s*(\d{2})\/(\d{2})\/(26|27)\s*<\/span>/);
    const points = [...card.matchAll(/<span class=['"]text-secondary-(?:400|700)['"]>\s*(?:<b>\s*)?(\d{1,3})\s*(?:<\/b>\s*)?<\/span>/g)]
      .map(match => Number(match[1]));
    if (!date || points.length !== 2) continue;
    const iso = '20' + date[3] + '-' + date[2] + '-' + date[1];
    if (iso <= today) record(csi, iso, names[0], names[1], points);
  }
}

function importCalcio8(html, game) {
  const matchId = game.id.slice('lega-c8-'.length);
  const row = html.split('<div class="match-element">').slice(1).find(item=>item.includes('/match/'+matchId+'/'));
  if (!row) return;
  const points = [...row.matchAll(/class=['"]score['"]>\s*(\d{1,3})\s*</g)].map(match=>Number(match[1]));
  if (points.length===2) matched.set(game.id,points);
}

async function updateCalcio8() {
  const games = fixtures.filter(game=>game.squadra===calcio8.id && game.data<=today);
  for (const game of games) {
    const response = await fetch(calcio8.endpoint,{
      method:'POST', body:new URLSearchParams({op:22,tid:124,round:1056,match_day:game.giornata}),
      signal:AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error('Lega Calcio a 8 HTTP '+response.status);
    const {html} = await response.json();
    if (typeof html !== 'string') throw new Error('Calendario Lega Calcio a 8 assente');
    importCalcio8(html,game);
  }
}

if (process.argv.length > 2) {
  for (const arg of process.argv.slice(2).filter(arg => arg.startsWith('--csi='))) {
    importCsi(fs.readFileSync(arg.slice(6), 'utf8'));
  }
  for (const arg of process.argv.slice(2).filter(arg => arg.startsWith('--lnd='))) {
    const page = lndPage(fs.readFileSync(arg.slice(6), 'utf8'));
    const competition = football.find(item => item.code === page.championship?.code && item.group === page.group?.code);
    if (!competition) throw new Error('Girone LND sconosciuto');
    importLnd(page, competition);
  }
} else {
  try {
    await updateCalcio8();
  } catch (error) {
    console.warn(calcio8.id + ': ' + error.message + '. Conservati i punteggi precedenti.');
  }
  try {
    const response = await fetch(csi.link, {signal: AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error('CSI HTTP ' + response.status);
    importCsi(await response.text());
  } catch (error) {
    console.warn(csi.id + ': ' + error.message + '. Conservati i punteggi precedenti.');
  }
  for (const competition of football) {
    try {
      const url = new URL(competition.link ?? 'https://gare.lnd.it/');
      if (!competition.link) {
        url.search = new URLSearchParams({campionato:competition.code, cr:'08', girone:competition.group, stagione:'2026'});
      }
      const index = await loadLnd(url);
      importLnd(index, competition);
      for (const day of index.matchdays.filter(day => (day.startDate === '0001-01-01' ? day.endDate : day.startDate) <= today)) {
        if (index.currentMatchday?.number === day.number && index.currentMatchday?.leg === day.leg) continue;
        if (competition.link && !fixtures.some(game => game.squadra === competition.id &&
            Number(game.giornata) === day.number && game.turno === (day.leg === 'first' ? 'Andata' : 'Ritorno'))) continue;
        url.searchParams.set('giornata', day.number);
        url.searchParams.set('leg', day.leg);
        const page = await loadLnd(url);
        if (page.currentMatchday?.number !== day.number || page.currentMatchday?.leg !== day.leg) {
          throw new Error('Giornata LND diversa da quella richiesta');
        }
        importLnd(page, competition);
      }
    } catch (error) {
      console.warn(competition.id + ': ' + error.message + '. Conservati i punteggi precedenti.');
    }
  }
  try {
    await updateFromStadiro();
  } catch (error) {
    console.warn('Stadiro: ' + error.message);
  }
}
for (const id of ambiguous) matched.delete(id);
if (!matched.size) throw new Error('Nessun risultato abbinato: file precedente conservato');
for (const [id, points] of matched) {
  const game = fixtures.find(item => item.id === id);
  const officialBaseScore = /^(?:LND|FIP|CSI)\b/i.test(String(game.fonte ?? '').trim());
  if (officialBaseScore && game.puntiCasa != null && (game.puntiCasa !== points[0] || game.puntiOspite !== points[1])) {
    console.warn('Punteggio discordante dal dato iniziale:', id);
    continue;
  }
  results[id] = points;
}
console.log(matched.size + ' gare abbinate, ' + Object.keys(results).length + ' risultati disponibili');
fs.writeFileSync(file, JSON.stringify(results, null, 2) + '\n');

