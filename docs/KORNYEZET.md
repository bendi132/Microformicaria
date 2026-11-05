# Környezet és éghajlat

## Éghajlati övek
| Faj | Öv | Megjegyzés |
|---|---|---|
| Odontomachus, Cephalotes | trópusi | +7 °C középhő, kisebb napi ingadozás, +16% páratartalom, gyakoribb eső, nincs hidegfront |
| Ponera, Proceratium | mérsékelt övi | alapértékek, hidegbetörés és kánikula is előfordul |

Az értékek **játékmechanikai közelítések**, nem mért éghajlati adatok (`CLIMATE` a `src/sim/config.js`-ben). A hatás a szimulációban is érvényesül (hőmérséklet, páratartalom, időjárás-valószínűségek → fészekklíma, fiasítás-fejlődés), és a megjelenésben is (talajszín, fű, köd, környező növényzet).

## Környező modellek (valós méretarányban)
1 játékegység = 1 mm; a játéktér 180 mm széles. A növények valós méretükben a játéktér **körül** állnak (a hangyák nem léphetnek oda), ezért hangyaléptékben óriásiak – ez a méretarány-hatás szándékos.

| Modell | Éghajlat | Valós méret (beállított) | Forrás a méretre |
|---|---|---|---|
| banana.glb | trópusi | 4,1 m magas | a modell saját méretéből (m) |
| bromeliads.glb | trópusi | ~30 cm | **becsült** |
| bromelia_flower.glb | trópusi | ~26 cm | **becsült** |
| jungle_roots.glb | trópusi | ~1 m-es folt | **becsült** (a két feltöltött fájl azonos, egy példány szerepel) |
| broken_trunk.glb | mindkettő | 2,5 m hosszú | a modell saját méretéből |
| tree_lowpoly.glb (2 fa) | mérsékelt | ~9 m / ~8 m | a modell FBX-skálájából (0,01) |
| oak_litter.glb | mérsékelt | ~1 m-es folt | **becsült** |
| mossy branch (FBX + PBR textúrák) | mérsékelt | ~1,2 m | **becsült** |

A modellek skálázása a határolódoboz alapján történik (`src/render/envview.js`, `ENV_MODELS`). Ha egy "becsült" méret nem helyes, egyetlen számot kell átírni.
A tömörített modellekhez (meshopt, KTX2/Basis) a három.js dekódolói a `vendor/three/jsm` alatt vannak.

## Cephalotes-fa (kéreg és furatok)
A fa törzse és ágai pontos hengerek (a hangyák a szimulációban ezen a felszínen járnak). A kéreg a feltöltött dzsungelfa/rönk-modell textúrájából készült (`assets/env/trunk_bark.jpg`, `trunk_bark_n.jpg`: a modell fotótextúrájából kivágott, tükrözéssel csempézhetővé tett kéregminta + lumináncia-alapú normáltérkép). A modell maga egy fekvő, félig beásott szkennelt rönk, ezért közvetlenül nem használható mászható törzsnek. A fészekbejáratok valódi furatok: a hengerháló a nyílás körül befelé hajlik, mélyén sötét üreg, peremén kéregperem.
A méz / növényi nedv csak a Cephalotes fáján (törzs, ágak) található; a többi fajnál nincs földi mézfolt, és a gyűjtögetés súlya 0.

## Megjelenés (v. 2026-11)
- Földalatti nézet: a járatok között szemcsés talajtömb és kavicsok látszanak (nem üres fekete háttér); a kamrák és járatok padlója normáltérképes, foltosan árnyalt.
- Levélavar: erezett, foltos, lyukas, enyhén felkunkorodó levelek; a moha sűrű, lapos, változatos zöld párnákból áll.
- A hangyák kutikuláján lakkszerű csillogás (clearcoat) és égbolt-környezettérkép tükröződik; a fény erőssége a napszakhoz és az időjáráshoz igazodik.

## Telefon / érintőképernyő
- **Érintésvezérlés** (`src/touch.js`): felülnézetben egy ujj = térkép húzása, koppintás = kijelölés/parancs, dupla koppintás = átvétel (első személy), két ujj = nagyítás (csippentés), forgatás (csavarás), dőlés (függőleges húzás). Első személyben bal oldalt lebegő joystick (teljes kitérésnél futás), jobb oldalt húzás = körbenézés; gombok: 🦷 harapás, ⌄/⌃ másodlagos, E, F, X, G, ␣ (Odontomachus ugrás), Q kilépés.
- **Alapértelmezett takarékos beállítások** telefonon: alacsony minőség, árnyék nélkül, 0,8-as felbontás-skála, élsimítás nélkül; a nehéz (4–12 MB) környezeti modellek kimaradnak (kevesebb letöltés és memória).
- **Dinamikus felbontás:** ha a képkockaidő tartósan 36 ms fölött van, a belső felbontás 0,4-ig csökken, és visszanő, ha van tartalék (Beállítások → Automatikus felbontás).
- **Felület:** reszponzív elrendezés fekvő és álló telefonhoz, biztonságos területek (notch), teljes képernyő gomb (Android), telepíthető webalkalmazás (`manifest.webmanifest`).

## Bevezető animáció és eszközválasztás

- Első indításkor a játék megkérdezi, hogy számítógépen/laptopon vagy telefonon játszol (`mf.settings.device`). Beállításokban ("Eszköz") később módosítható; a váltás újratölti az oldalt, és az eszköznek megfelelő alapbeállításokat alkalmazza.
- Új játék indításakor, a faj kiválasztása után egy ~19 mp-es filmes bevezető fut (`src/intro.js`, képek: `assets/intro/s1..s4.jpg`): 4 jelenet, lassú kamera/parallaxis, keresztáttűnés, részecskék, felirat. Kattintással/érintéssel/Esc/Enter/Space gombbal átugorható; a Beállításokban ("Bevezető animáció") kikapcsolható; `prefers-reduced-motion` esetén egyszerűsített.
- A feliratok angolul vannak (a specifikáció szerint); a `LANG` konstans átváltja magyarra.
- A 3. jelenethez nem volt föld alatti fotó, ezért a meglévő képet sötét, barna színkorrekcióval használja.
