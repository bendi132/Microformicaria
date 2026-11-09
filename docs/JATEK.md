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
- Események: **pók a fészek közelében**, **hőhullám**, **heves eső / elöntés** (talajfészeknél), **szűk a fészek** (új fiasítás- vagy raktárkamra ásatása), **éheznek a lárvák**, **bőséges zsákmány** (vadászó / magevő fajoknál).
- Minden opció *időszakos módosítókat* ad (pl. őrség ×2,2, vadászat ×0,7 egy napra), néha azonnali hatást (kamra-ásatás, gyenge lárvák feláldozása, zsákmány megjelenése). A kártyán látszik, mit változtat és mibe kerül; mindig van „Nem avatkozunk be” opció, ez lép életbe, ha a döntési idő (0,7 nap) lejár.
- Az opció idejének lejártakor az eredmény *kiértékelődik* a mért adatokból (elesett hangyák, elveszett fiókák, beszerzés, elöntés, elkészült kamra): sikeres / vegyes / sikertelen, üzenettel. Aki döntött, XP-t kap (sikeres: 4–5, vegyes: 2–3, sikertelen: 1); az automatikus (időtúllépéses) döntés nem ad XP-t.
- Az események a szimuláció RNG-jét használják, ezért azonos magnál és azonos döntéseknél azonos az eredmény (`test/manage.test.mjs`).

**Mentés:** a vezetői állapot a kolóniával együtt mentődik; régi mentés (vezetői adat nélkül) is betölthető. A játék statisztikái (`sim.stats`) is mentődnek.
