# Játékmenet: előrehaladás, feloldások, irányítás, kolónia-vezetés

## Szint és XP (`src/game/progress.js`)

- Az előrehaladás a böngészőben (`localStorage`) tárolódik, a szimulációtól független; a főmenüben látszik a szint és a statisztika.
- **XP-forrás:** elejtett zsákmány (+2 XP / db), sikeres kolóniaalapítás (+30 XP), jól kezelt vezetői döntés (+2…6 XP, lásd alább).
- **Szint:** `1 + floor(sqrt(XP / 20))`; a következő szint a négyzetesen nő.

## Fajok feloldása

| Faj | Feltétel (összesített, minden játékból) |
|---|---|
| Cephalotes, Odontomachus | szabad |
| Messor barbarus | 1 sikeres kolóniaalapítás |
| Ponera (Nehéz) | 2 sikeres alapítás + 10 zsákmány |
| Proceratium (Nehéz) | 3 sikeres alapítás + 30 zsákmány |

- **Sikeres alapítás:** Normál vagy Nehéz játék, legalább a 10. napon, élő királynővel és legalább 8 dolgozóval. A Kezdő, kész kolónia nem számít. Játékonként egyszer számolódik.
- A zárolt fajok a faj-választóban lakatot kapnak, a leírás pedig megmutatja a feltételeket és az állást. Az „Új játék” indítása zárolt fajnál nem lehetséges.
- Új szint, új faj vagy alapítás esetén felugró üzenet jelenik meg.

## Irányítási súgó

- Az első új játék előtt egyszer megjelenik az „Irányítás” képernyő (egér, billentyűk, mit lehet irányítani). Később a főmenüből és a szünetmenüből is elérhető.

## Kis kör-kamra (zsebkamra)

- Az ásás eszköztárában a **forma** választható: „járat + kamra” (alapértelmezett) vagy „kis kör-kamra”.
- A zsebkamra a fajra jellemző teljes kamránál kisebb (sugara `max(2,4; 0,6 × kamrasugár)` mm), rövid járat után, kerek üregként jön létre. Ugyanúgy számít a kamrák maximális számába.
- Ásás közben a kurzor kör alakú jelölője a kiválasztott formát mutatja.

## Kolónia-vezetés (menedzsment réteg)

Cél: a nagyobb kolónia ne „menjen magától”, hanem a játékos a vezetője legyen. A szimulációs rész a `src/sim/manage.js` (DOM nélkül, determinisztikus, a kolónia részeként menthető), a felület a `src/ui/mgmt.js`. Megnyitás: **📋 gomb** vagy **M**; a panel nem szünetel, a játék közben is nyitva marad.

**Munkaerő fül**
- Az *aktuális munkaelosztás* sávja: hányan vadásznak, gyűjtenek, hordanak vizet, dajkálnak, ásnak, őrködnek, pihennek.
- *Irányelvek* (egy kattintásos előbeállítások): Kiegyensúlyozott, Terjeszkedés, Gyűjtés, Fiasítás, Védelem. A csúszkák kézzel is állíthatók (ilyenkor „egyéni”).
- *Prioritások*: csúszka a feladatonként (fajfüggő sorok: pl. a magevő Messor nem vadászik, a faüregi Cephalotes nem ás), mellette a jelenleg azt végző dolgozók száma és az aktív intézkedések szorzója.
- A csúszkák súlyként hatnak a dolgozók feladat-választására (`tasks.js` `chooseTask`); az érték a tényleges `effDir` = csúszka × aktív módosítók.

**Készlet fül:** zsákmány, cukor/nektár, víz (és a magevő fajoknál a magtár) a kapacitáshoz képest, trend-nyíllal (az elmúlt nap) és sparkline-nal, „hiány” jelzéssel; dolgozók és fiasítás alakulása; a kamrák kihasználtsága és a kamraszám.

**Jelentés fül:** a napi jelentés (népesség, születés/veszteség, beszerzés, zsákmány, elveszett fióka) legfeljebb három, fajra szabott tanáccsal (pl. „a raktár megtelt, áss raktárkamrát”). Alatta a döntések naplója és a korábbi napok. Nap végén rövid jelentés-kártya is megjelenik.

**Döntési események**
- A kolónia 6 dolgozótól (és a 2. naptól) kezdve időnként döntési kártyát kap; kb. 2–3 naponként (Kezdő: ritkábban, Nehéz: gyakrabban). Egyszerre egy lehet; érkezéskor a sebesség 1×-ra áll.
- Események (18 típus, kb. 0,5–1 naponként egy): **pók a fészek közelében**, **hőhullám**, **heves eső / elöntés** (talajfészeknél), **szűk a fészek**, **éheznek a lárvák**, **bőséges zsákmány**, és újabban: **penész a fészekben**, **lisztkukacok a közelben**, **elhullott bogár** (dögevő fajoknál), **levéltetű-telep** és **katicabogár-lárva a tetveken** (erdei élőhelyeken), **hangyaleső-tölcsér**, **madár**, **közelgő óriás léptek**, **kerti locsoló**, **hideg éjszaka**, **szárazság**, **atkák a fiasításon**.
- A veszélyes eseményeknél az opcióknak **kockázata** van (a kártyán „⚠ kis / közepes / nagy kockázat”): futás közben másodpercenként esély van egy felszíni dolgozó (vagy atkáknál egy fióka) elvesztésére; a jó döntés ezt lecsökkenti.
- Minden opció *időszakos módosítókat* ad (pl. őrség ×2,2, vadászat ×0,7 egy napra), néha azonnali hatást (kamra-ásatás, gyenge lárvák feláldozása, zsákmány megjelenése). A kártyán látszik, mit változtat és mibe kerül; mindig van „Nem avatkozunk be” opció, ez lép életbe, ha a döntési idő (0,7 nap) lejár.
- Az opció idejének lejártakor az eredmény *kiértékelődik* a mért adatokból (elesett hangyák, elveszett fiókák, beszerzés, elöntés, elkészült kamra): sikeres / vegyes / sikertelen, üzenettel. Aki döntött, XP-t kap (sikeres: 4–5, vegyes: 2–3, sikertelen: 1); az automatikus (időtúllépéses) döntés nem ad XP-t.
- Az események a szimuláció RNG-jét használják, ezért azonos magnál és azonos döntéseknél azonos az eredmény (`test/manage.test.mjs`).

**Mentés:** a vezetői állapot a kolóniával együtt mentődik; régi mentés (vezetői adat nélkül) is betölthető. A játék statisztikái (`sim.stats`) is mentődnek.

## Lisztkukac (`src/render/…`, `assets/models/mealworm.glb`, `tools/prep_mealworm.py`)

Új zsákmányállat (a lisztbogár lárvája): 16–26 mm, lassú, ártalmatlan, puha testű, nagy tápértékű. Az ászka-rendszer egyik változata (`sp: 'mealworm'`), ezért a vadászat, a tetem, a menekülés és a kiválasztás ugyanúgy működik. Egy hangyához képest óriás, ezért **egyedül nehéz legyőzni, csoportban könnyű**: aki túl nagy, de legyőzhető zsákmányt lát, *riasztja* a többieket (`p.calls`, legfeljebb 6), és a csoport ereje növeli a méretkorlátot (`tasks.js`). A modell procedurális (13 szelvény, szelvényhatáron barnás sáv, sötét fej, három pár láb, csáp, rágó, farok-tüskék); a shaderben hullámzó (perisztaltikus) mozgás, lépő lábak, tapogató csáp, rágó és találatkor C alakba görbülés van (`rig.js`, kind 5). Természetes állomány a rönkök, kövek és moha alatt; a „Lisztkukacok a közelben” esemény csoportot hoz.

## Növekvő játszható terület

A világ kezdettől 360×360 mm (`WORLD_MAX = 180`), de csak a közepe játszható: 180×180 mm-ről indul, és a dolgozók számával nyílik meg (14 dolgozó → 240 mm, 32 → 300 mm, 60 → 360 mm; `TERRITORY` a `config.js`-ben). A kezdeti rész tartalma változatlan; a külső gyűrű (kövek, rönkök, moha, fűcsomók, növények, búvóhelyek, pókfészkek) külön RNG-vel készül (`extendWorld`), ezért a régi mentések is bővíthetők (`upgradeWorld`). A határt halvány fal jelzi, a még nem megnyílt talaj sötétebb. Az állatállomány és a pókok maximális száma a terület nagyságával nő. A terület soha nem zsugorodik.

## Penész

Kamránként `nd.mold` (0–1). Nő, ha a kamra nedves (>0,72) és meleg (10–34 °C); a raktárkamrában (főleg ha tele van) és elöntés után gyorsabban; az erős penész a szomszéd kamrákat is fertőzi. Csökkenti: a dolgozók folyamatos takarítása (több dolgozó = gyorsabb), a vezetői `hygiene` módosító és a szellőzőjárat (`nd.vent`). Hatása: a raktár készlete romlik, a fiasítás lassabban fejlődik és 45% fölött elpusztulhat. A fészeknézetben a kamra zöldes-szürkére színeződik; a Készlet fülön és a napi tanácsok között is megjelenik. A „Penész a fészekben” esemény opciói: nagytakarítás, szellőzőjárat ásása, a penészes készlet kidobása, vagy nem avatkozunk be.

## Levéltetű-farm (`src/sim/aphids.js`, `src/render/hosts.js`, `assets/models/aphid.glb`, `tools/prep_aphid.py`)

- **Élőhely:** gazdanövények (`world.hosts`) csak erdőben vannak: mérsékelt övben csalán, varádics, here, bogáncs; trópusokon hibiszkusz, ixóra, heliconia, lantána (a fészek körül ~15, a kibővülő területen további 16). **Sivatagban nincs levéltetű és gazdanövény** (a fa-világban – Cephalotes – a fa nedve a cukorforrás). Változatonként egy InstancedMesh rajzolja őket.
- **Tetvek** (`world.aphids`): a fészek közelében 3 vadon élő telep (2–2 tetű) van. Szaporodnak (partenogenezis: 12–32 °C, növényenként legfeljebb 6, összesen 36), a növényen élnek, és **mézharmatot** termelnek (`world.foods`, `sap` típus, `aphid` hivatkozással). A hangyák jelenléte (≤12 mm) 1,7× termelést ad, és véd a ragadozótól; védtelen tetvet ritkán elkap a katicabogár-lárva / fátyolka.
- **Gyűjtés:** a ragadozó fajok (Ponera, Odontomachus, Proceratium) is gyűjtenek cukrot, amint kész mézharmat van (`sim.honeyReady`); a Messor és a Cephalotes a megszokott módon.
- **Játékos (FPV):** **E rövid koppintás** = tetű felvétele (szájba veszi), újabb koppintás növény mellett = ráteszi (`placeAphid`; növényenként legfeljebb 8). **E nyomva tartva** = evés / a mézharmat „fejése”. **G** = leteszi (növény nélkül elveszik).
- **Események:** *Levéltetű-telep a közelben* (gondozás / gyors fejés) és *Katicabogár-lárva a tetveken* (őrjárat / áttelepítés E-vel / semmi); az *Atkák a fiasításon* esemény alatt valódi, animált atka-modell mászkál a fiasításon (a tisztogatás alatt fogyatkoznak). Az ellenséges kolónia esemény megszűnt.
- **Mentés:** `world.hosts` / `world.aphids` a világgal együtt mentődik; régi mentésben a növények pótlódnak (`ensureHosts`).

## Képek, modellek és licencek

- **Atka (`assets/models/mite.glb`)**: *Animated mite* – Osian3D, licenc: CC-BY-4.0 (Sketchfab). A textúrák 512 px-re kicsinyítve.
- **Levéltetű (`aphid.glb`)**: a mellékelt valódi levéltetű-modellből `tools/prep_aphid.py` készítette (új elülső lábak, csápok, zöld színezés).
- A többi modell (hangyák, ászka, pók, ugróvilla, skorpió, lisztkukac) a projekt saját, `tools/` szkriptekkel készült vagy előkészített eszköze.
