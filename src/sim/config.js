// A játék alapadatai. A BIOLÓGIAI ALAPOK és a JÁTÉKMECHANIKAI EGYSZERŰSÍTÉSEK külön vannak jelölve:
//   bio:  a fajra jellemzőként ismert tulajdonság (lásd docs/BIOLOGIA.md)
//   game: játékegyensúlyi alapérték / egyszerűsítés (nem mért adat)
// Egység: 1 világegység = 1 mm. Idő: szimulációs másodperc; 1 játéknap = DAY mp 1x sebességnél.

export const DAY = 150;                      // game
export const WORLD_HALF = 90;                // a játéktér fél-oldala (mm)
export const GAME_START_HOUR = 7;

export const ANIMALS = ['ant', 'isopod', 'spider', 'springtail']; // a játékban hangyák, ászkák, pókok és ugróvillások szerepelnek (atka nem)

export const SPECIES = {
  ponera: {
    id: 'ponera', climate: 'temperate', name: 'Ponera', latin: 'Ponera sp.', difficulty: 'Nehéz', diffLevel: 3, model: 'ponera', tint: 0x8b4a2b,
    blurb: 'Rejtőzködő, talajlakó ragadozó hangya. Lassú, óvatos, keskeny járatokat váj; apró ízeltlábúakra vadászik. Kis kolónia, a királynő és a fiasítás védelme kiemelt feladat.',
    blurbIso: 'Csak a kisebb ászkákat tudja elejteni (fullánkkal bénítja). A nagyobb ászkák számára túl veszélyesek. Pókok elől a szűk járatok védik: a nagyobb pókok nem férnek be.',
    size: { queen: 4.6, worker: 3.6 }, speed: { queen: 4.2, worker: 5.2 }, run: 1.5,
    senses: { prey: 9, water: 14, spider: 15 },   // game: érzékelési sugarak (mm)
    hunt: { live: true, scavenge: true, style: 'sting', reach: 0.55, base: 0.62, maxRatio: 1.25, group: 0.9, cooldown: 2.4, energyCost: 0.9, injury: 0.05, crevice: 1.0, armorPierce: 0.45, paralyze: 3.0 },
    defend: { armor: 1.0, dodge: 0.10, stealth: 0.55, fight: { dmg: 1.3, rate: 0.42, range: 0.7 }, group: 4, escape: 'hide', flee: 1.35 },
    nest: { type: 'soil', tunnelW: 1.5, chamberR: 3.2, maxChambers: 7, digRate: 0.55, entranceW: 1.4 },
    brood: { egg: 2.0, larva: 4.5, pupa: 3.5, layEvery: 0.55, eggCost: 4, larvaNeed: 7, firstWorkers: 2 },
    needs: { energyDrain: 30, waterDrain: 26, humOpt: [0.45, 0.8], tempOpt: [18, 27] },
    capacity: 36, health: { queen: 100, worker: 70 }, carry: 5, crop: { queen: 30, worker: 9 },
    colorWorker: 0x1a1512,
  },
  cephalotes: {
    id: 'cephalotes', climate: 'tropical', name: 'Cephalotes', latin: 'Cephalotes sp. – teknőshangya', difficulty: 'Közepes', diffLevel: 2, model: 'cephalotes', tint: 0x1b1814,
    blurb: 'Fán élő, páncélozott hangya. Faüregekben fészkel; a lapos fejű katonák a bejáratot a saját fejükkel zárják el. A táplálékot elsősorban a fákon és azok környezetében gyűjti.',
    blurbIso: 'Élő ászkát alig tud elfogni (nem vadász jellegű); az elpusztult ászkák tetemét viszont hazaviszi. A pókok ellen páncélja és a fejjel elzárt bejárat véd.',
    size: { queen: 8.4, worker: 6.2, soldier: 7.4 }, speed: { queen: 3.4, worker: 4.2 }, run: 1.4,
    senses: { prey: 8, water: 13, spider: 14 },
    hunt: { live: false, scavenge: true, style: 'bite', reach: 0.5, base: 0.22, maxRatio: 0.5, group: 0.5, cooldown: 3.4, energyCost: 0.8, injury: 0.02, crevice: 0.5, armorPierce: 0.2, paralyze: 0 },
    defend: { armor: 0.55, dodge: 0.12, stealth: 0.8, fight: { dmg: 0.7, rate: 0.3, range: 0.6 }, group: 3, escape: 'plug', flee: 1.2 },
    nest: { type: 'tree', tunnelW: 3.2, chamberR: 4.5, maxChambers: 5, digRate: 0.0, entranceW: 3.6 },
    brood: { egg: 3.0, larva: 6.0, pupa: 5.0, layEvery: 0.7, eggCost: 6, larvaNeed: 10, firstWorkers: 2 },
    needs: { energyDrain: 26, waterDrain: 22, humOpt: [0.35, 0.7], tempOpt: [22, 32] },
    capacity: 28, health: { queen: 110, worker: 90, soldier: 130 }, carry: 7, crop: { queen: 32, worker: 12 },
    colorWorker: 0x7a5636,
  },
  odonto: {
    id: 'odonto', climate: 'tropical', name: 'Odontomachus', latin: 'Odontomachus sp. – csapdakapcsú hangya', difficulty: 'Könnyű–közepes', diffLevel: 1, model: 'odonto', tint: 0x7a4a30,
    blurb: 'Aktív, gyors reagálású vadász. A tágra nyitott rágókat a zsákmány közelében hirtelen összecsapja. A vadászat energiát és sérülésveszélyt jelent, a csapás nem használható korlátlanul.',
    blurbIso: 'A legjobb ászkavadász: a közepes ászkák elejthetők, a nagyok csak többedmagukkal. Pókok ellen visszatámadhat, és a rágók csapásával elugorhat a veszély elől – de a nagy pók ellen így is alulmarad.',
    size: { queen: 11, worker: 9.5 }, speed: { queen: 6.5, worker: 8.4 }, run: 1.9,
    senses: { prey: 12, water: 16, spider: 20 },
    hunt: { live: true, scavenge: true, style: 'snap', reach: 0.42, base: 0.80, maxRatio: 1.05, group: 1.1, cooldown: 4.2, energyCost: 1.6, injury: 0.07, crevice: 0.3, armorPierce: 0.8, paralyze: 0 },
    defend: { armor: 0.85, dodge: 0.30, stealth: 0.2, fight: { dmg: 3.4, rate: 0.5, range: 0.5 }, group: 3, escape: 'jump', flee: 1.7 },
    nest: { type: 'soil', tunnelW: 3.6, chamberR: 4.8, maxChambers: 8, digRate: 0.5, entranceW: 3.4 },
    brood: { egg: 2.5, larva: 5.0, pupa: 4.0, layEvery: 0.6, eggCost: 6, larvaNeed: 12, firstWorkers: 2 },
    needs: { energyDrain: 32, waterDrain: 28, humOpt: [0.4, 0.75], tempOpt: [20, 30] },
    capacity: 40, health: { queen: 100, worker: 80 }, carry: 9, crop: { queen: 36, worker: 14 },
    colorWorker: 0xffffff,
  },
  proceratium: {
    id: 'proceratium', climate: 'temperate', name: 'Proceratium', latin: 'Proceratium sp. – tojásrabló hangya', difficulty: 'Nehéz', diffLevel: 3, model: 'proceratium', tint: 0xc4561f,
    blurb: 'Rejtőzködő talajlakó specialista: nem az élő zsákmányra, hanem ízeltlábúak petéire vadászik. Az ugróvillások, az ászkák és a pókok petéit lopja el. Lassú, óvatos, kis kolónia.',
    blurbIso: 'Az élő ászkát és ugróvillást békén hagyja, de a petéiket (az ugróvillás tojáscsomóit, az anyaászka költőzsákját, a pók petezsákját) fosztogatja. A pókfészek őrzője a legnagyobb veszély.',
    size: { queen: 5.0, worker: 4.0 }, speed: { queen: 3.8, worker: 4.6 }, run: 1.5,
    senses: { prey: 10, water: 13, spider: 14, eggs: 22 },
    hunt: { live: false, eggs: true, scavenge: false, style: 'egg', reach: 0.5, base: 0.0, maxRatio: 0.0, group: 0, cooldown: 2.2, energyCost: 0.7, injury: 0.0, crevice: 1.0, armorPierce: 0.3, paralyze: 0 },
    defend: { armor: 1.0, dodge: 0.12, stealth: 0.7, fight: { dmg: 1.0, rate: 0.35, range: 0.6 }, group: 5, escape: 'hide', flee: 1.3 },
    nest: { type: 'soil', tunnelW: 1.6, chamberR: 3.2, maxChambers: 6, digRate: 0.5, entranceW: 1.5 },
    brood: { egg: 2.2, larva: 5.0, pupa: 3.8, layEvery: 0.65, eggCost: 4, larvaNeed: 8, firstWorkers: 2 },
    needs: { energyDrain: 28, waterDrain: 26, humOpt: [0.5, 0.85], tempOpt: [17, 26] },
    capacity: 24, health: { queen: 100, worker: 65 }, carry: 6, crop: { queen: 28, worker: 8 },
    colorWorker: 0x120f0d,
  },
};

// Ugróvillások (zsákmány) – apró, nedves almot kedvelő, ugrással menekülő állatok. bio: furcula (ugróvilla); game: ugrástáv/időzítés.
export const SPRINGTAIL = { len: [1.4, 2.6], speed: 5.5, jumpDist: [9, 22], jumpCd: 1.1, senses: 6.5, max: 46, energyPerMm3: 0.3, eggs: [3, 9], eggDays: 1.6, layEvery: 1.3, max2: 80 };

// Ászkák (zsákmány) – méretosztályok. game: statok; bio: éjszakai, nedvességkedvelő, korhadék-evő.
export const ISOPOD = {
  classes: {
    small:  { len: [2.6, 4.2],  weight: 0.5, armor: 0.12, hp: 5,  speed: 3.2 },
    medium: { len: [5.0, 7.5],  weight: 0.35, armor: 0.40, hp: 18, speed: 3.8 },
    large:  { len: [9.0, 13.0], weight: 0.15, armor: 0.78, hp: 60, speed: 4.2 },
  },
  energyPerMm3: 0.3,           // game: táplálékérték = len^3 * ez (ugróvillás ~2, kis ászka ~12, nagy ászka ~400)
  flee: 2.1, senses: 8,
  max: 26, gravidChance: 0.35, eggs: [14, 34], brood: 2.6,
};

// Pókok – méretosztályok és veszélyesség (game).
export const SPIDER = {
  classes: {
    small:  { len: 4.5,  hp: 12, bite: 22, speed: 7.5,  burst: 34, detect: 16, lunge: 7,  weight: 0.5 },
    medium: { len: 7.5,  hp: 34, bite: 40, speed: 9.5,  burst: 42, detect: 24, lunge: 10, weight: 0.35 },
    large:  { len: 11.5, hp: 80, bite: 70, speed: 11.5, burst: 50, detect: 32, lunge: 14, weight: 0.15 },
  },
  territory: 42, cooldown: 3.2, huntNightBias: 0.65, sacDays: 6, sacEggs: [18, 46], guardRadius: 11,
};

export const DIFFICULTY = {
  easy:   { name: 'Könnyű',  lairs: 1, spiderMax: 1, sizeBias: -0.3, isopods: 1.25, drain: 0.8, spawnPerDay: 0.35 },
  normal: { name: 'Normál',  lairs: 2, spiderMax: 2, sizeBias: 0.0,  isopods: 1.0,  drain: 1.0, spawnPerDay: 0.6 },
  hard:   { name: 'Nehéz',   lairs: 3, spiderMax: 3, sizeBias: 0.25, isopods: 0.8,  drain: 1.2, spawnPerDay: 0.9 },
};

export const TASKS = ['hunt', 'forage', 'water', 'nurse', 'dig', 'repair', 'guard'];
export const TASK_HU = { raid: 'Petelopás', manual: 'Irányítva', hunt: 'Vadászat', forage: 'Táplálékgyűjtés', water: 'Vízkeresés', nurse: 'Fiasításgondozás', dig: 'Ásás', repair: 'Fészekjavítás', haul: 'Szállítás', guard: 'Veszélyfigyelés', rest: 'Pihenés', flee: 'Menekülés', fight: 'Védekezés', eat: 'Táplálkozás', drink: 'Ivás', idle: 'Tétlen', lay: 'Petézés', seek_nest: 'Fészekhely-keresés', plug: 'Bejárat elzárása' };

// Éghajlati övek: a faj élőhelye határozza meg a hőmérsékletet, a páratartalmat, az esők gyakoriságát és a megjelenő növényzetet.
// Az értékek játékmechanikai közelítések (nem mért éghajlati adatok).
export const CLIMATE = {
  temperate: { name: 'Mérsékelt övi', tempShift: 0, tempAmp: 1.0, humShift: 0, rainBias: 0, coldBias: 1, heatBias: 1 },
  tropical:  { name: 'Trópusi', tempShift: 7, tempAmp: 0.55, humShift: 0.16, rainBias: 0.12, coldBias: 0, heatBias: 0.6 },
};
