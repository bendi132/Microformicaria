# Játékmenet: előrehaladás, feloldások, irányítás

## Szint és XP (`src/game/progress.js`)

- Az előrehaladás a böngészőben (`localStorage`) tárolódik, a szimulációtól független; a főmenüben látszik a szint és a statisztika.
- **XP-forrás:** elejtett zsákmány (+2 XP / db), sikeres kolóniaalapítás (+30 XP).
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
