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
