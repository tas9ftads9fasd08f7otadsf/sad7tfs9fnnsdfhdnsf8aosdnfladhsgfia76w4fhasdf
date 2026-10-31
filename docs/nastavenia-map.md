# Nastavenia máp v jednom JSON

Tiket 381 (október 2026). Jeden súbor
[`workers/data/map-settings.json`](../workers/data/map-settings.json) hovorí,
s čím sa mapa robí: pre krajinu a presnejšie pre jej kraj, a vedľa krajín pre
pohoria ako celok a presnejšie pre každé pohorie – výškové modely, sklon skál,
vrstevnice, zoomy, rozpočet, vypínače vrstiev, letecké snímky. Formuláre
workflowov sa pýtajú len **čo** robiť; prvý job behu vypíše, s čím beh ide a
odkiaľ ktorá hodnota prišla.

§1–§6 je hotový stav (tikety 381 a 382), §7 ďalšie kroky.

## 1. Prečo

Pred týmto tiketom bolo jedno nastavenie na deviatich miestach:

| Čo | Kde bolo |
|---|---|
| predvolené prepínače a zoomy (`contour_interval=5`, `contour_maxzoom=14`, `size_limit_mb=900`, …) | `DEFAULTS` v `workers/plan/options.py` |
| výškový model vrstevníc, skál a tieňovania (`dmr5`) | `default:` v štyroch formulároch |
| model pohoria | natvrdo `--contour-source=dmr5 …` v `mountain.yml` |
| čím sa pohorie líši (`terrain_maxzoom=17`, `size_limit_mb=2000`, …) | `MOUNTAIN_OPTIONS` v `mountain.yml` |
| sklon skál (`50`) | `default:` v každom formulári zvlášť |
| krajina bez modelu (Česko, Rakúsko) | `dem: false` v `regions.json` |
| letecké snímky a ich zoomy | `aerial.json` – jeden zdroj na sezónu pre všetky pohoria |
| zoznam modelov | `dem-sources.json` |
| autori a licencie | `credits.json`, a ktorý balík ich nesie, natvrdo v `packages.json` |

Formulár `build-map-state` ponúkal `dmr5` aj pre Česko, kde nie je, a
`options.py` to potom potichu vypol. Pohorie si nemohlo vybrať zdroj snímok.
A voľné pole `options` dovolilo beh, ktorého nastavenia neboli nikde zapísané.

## 2. Súbor

```jsonc
{
  "_comment": ["…"],

  // každý kľúč, ktorý existuje, s hodnotou pre každú mapu
  "defaults": {
    "contour_source": "dmr5", "rock_source": "dmr5", "shading_source": "dmr5",
    "rock_slope": 50, "contour_interval": 5, "contour_maxzoom": 14,
    "size_limit_mb": 900, "trails": true, "publish": true,
    "aerial_summer": "", "aerial_winter": "", "aerial_maxzoom": "",
    "…": "…"
  },

  // zdroje, z ktorých si mapa vyberá; každý menuje svojich autorov
  "sources": {
    "dem": {
      "dmr5":  { "label": "DMR 5.0", "store": "dem-dmr5-v2", "for": ["contours", "rocks", "shading"], "credits": ["dmr5"], "…": "…" },
      "sonny": { "label": "Sonny's LiDAR DTM 20m", "for": ["contours", "rocks", "shading"], "credits": ["sonny"], "…": "…" }
    },
    "aerial": {
      "ofmozaika_sk": {
        "label": "Ortofotomozaika SR (freemap.sk)", "season": "summer",
        "url": "https://ofmozaika2c.tiles.freemap.sk/{z}/{x}/{y}.jpg",
        "minzoom": 8, "maxzoom": 17, "covers": ["SK"],
        "credits": ["ortofoto", "freemap"]
      }
    }
  },

  // autori a licencie v tvare, ktorý číta aplikácia (`LayerCredit`)
  "credits": {
    "dmr5":     { "holder": "ÚGKK SR", "work": "DMR 5.0 (LiDAR)", "license": "CC BY 4.0", "…": "…" },
    "ortofoto": { "holder": "GKÚ Bratislava, NLC Zvolen", "work": "Ortofotomozaika SR", "…": "…" }
  },

  // kategórie ako v maps.json: krajiny a vedľa nich pohoria
  "maps": {
    "slovensko": { "settings": {}, "regions": {} },
    "cesko":   { "settings": { "contour_source": "none", "rock_source": "none", "shading_source": "none" } },
    "rakusko": { "settings": { "contour_source": "none", "rock_source": "none", "shading_source": "none" } },
    "mountains": {
      "settings": {
        "contour_interval": 5, "contour_maxzoom": 16, "contour_maxzoom_cap": 16,
        "contour_lowland_m": 0, "terrain_maxzoom": 17, "size_limit_mb": 2000,
        "aerial_summer": "ofmozaika_sk"
      },
      "ranges": { "vysoke_tatry": { "settings": {} }, "…": {} }
    }
  }
}
```

**Kľúče sú ploché** a volajú sa ako výstupy `opt_<kľúč>`, ktoré joby čítajú
(`rock_slope`, `contour_interval`, `aerial_summer`). Žiadna prekladová tabuľka,
`grep` nájde kľúč v súbore aj vo workflowe. Hodnoty sú normálne JSON typy
(`true`, `5`, `2.5`); `null` aj `""` znamená „nemá“.

Kraj pridaný pod `maps.slovensko.regions` prepíše len to, čo uvedie, napr.
`"zilinsky": { "settings": { "rock_slope": 45 } }`.

**Pohoria sú kategória vedľa krajín, nie pod nimi** – tak ako v `maps.json`
(`mountains.ranges`) a v aplikácii. Vysoké Tatry nie sú kraj Slovenska, ležia
v SK aj PL a robia sa inak než kraj. Pohorie preto **nededí nič zo Slovenska**,
len z `defaults` a z `maps.mountains`.

**Čo zmizlo:** `aerial.json`, `dem-sources.json`, `credits.json`,
`dem: false` z `regions.json`, hodnoty z `DEFAULTS` v `options.py` (ostali
`DESCRIPTIONS` – čo kľúč znamená), `MOUNTAIN_OPTIONS` a natvrdo `dmr5` z
`mountain.yml`.

**Čo ostalo, kde je:** `regions.json` a `areas.json` (geografia – kde mapa
leží a odkiaľ je jej PBF) a `mountains.json` (výrez, krajiny a OSM výrezy
pohoria).

**Kredit patrí zdroju, nie balíku.** Balík v `packages.json` povie len druh
zdroja (`dem:contours`, `aerial:summer`); katalóg vezme `credits` zdroja,
ktorý mapa naozaj použila – model z manifestu kraja, snímky z
`aerial_<sezóna>_source` v manifeste pohoria. Manifest spred tiketu 382
zdroj snímok nemá, berie sa `ofmozaika_sk` – iný vtedy nebol.

## 3. Dedenie: od všeobecného k presnému

```
kraj                                       pohorie
maps.<krajina>.regions.<kraj>.settings     maps.mountains.ranges.<pohorie>.settings
  ↑ maps.<krajina>.settings                  ↑ maps.mountains.settings
  ↑ defaults                                 ↑ defaults
```

- Kraj dedí od svojej krajiny cez `country` v `regions.json`. Kraj bez záznamu
  berie krajinu celú; krajina bez záznamu v `maps` berie `defaults` (lint to
  pre krajiny, ktoré formulár stavia, nedovolí).
- Neznámy kľúč na ktorejkoľvek úrovni je chyba – preklep `rock_slop` by sa
  inak potichu zdedil z `defaults`.
- Každá hodnota si pamätá, odkiaľ prišla (`defaults`, `cesko`,
  `slovensko › zilinsky`, `mountains`, `mountains › vysoke_tatry`).

## 4. Formuláre

| workflow | pýta sa |
|---|---|
| `Map · Build map region` | `region`, `area`, `test`, `rebuild`, `publish_pages` |
| `Map · Build map state` | `country`, `rebuild`, `test` (+ štafetový `continuation`) |
| `Map · Regenerate region layer` | `region`, `what`, `test` |
| `Map · Regenerate state` | `country`, `what`, `test` (+ `continuation`) |
| `Map · Build mountain package` | `mountain`, `rebuild`, `test` |

Zmizli `contour_source`, `rock_source`, `shading_source`, `rock_slope`,
`aerial_maxzoom` a voľné `options`.

**Prečo hodnoty nie sú vo formulári.** `default:` vstupu `workflow_dispatch` je
text v YAML; GitHub ho číta, keď kreslí formulár, a nijaký súbor z repozitára
si pritom neprečíta, ani nevie, aký kraj človek o riadok vyššie vybral.
Formulár by ukazoval `dmr5` aj pri Česku. Preto v ňom nastavenia nie sú vôbec
a ukáže ich až beh.

**Ladenie** = zmena hodnoty v `map-settings.json` na vetve a beh z tej vetvy
(*Use workflow from*). Nastavenie každého behu je tak v gite.

**Dávky krajiny** posielajú krajom len `rebuild`, `test` (a pevné
`area: whole_region`, `publish_pages: false`); každý kraj si nastavenia vezme
sám. Kraj sa spúšťa z vetvy, nie z commitu: zmena nastavení počas dňa, ktorý
dávka beží, platí pre kraje, ktoré ešte nebežali – tak ako zmena kódu.

## 5. Prvý job behu

Build kraja, regenerácia vrstvy a pohorie majú prvý job `settings`
([`workers/plan/settings.sh`](../workers/plan/settings.sh)); dávky krajiny
majú prvý krok s nastaveniami krajiny. Vypíšu formulár a potom:

| setting | value | from |
|---|---|---|
| `aerial_summer` | `ofmozaika_sk` | **mountains** |
| `contour_interval` | `5` | **mountains** |
| `contour_source` | `dmr5` | defaults |
| `rock_slope` | `50` | defaults |

so skratkou commitu, z ktorého sa súbor čítal. Hodnoty, ktoré z nastavení
vychádzajú (`contours`, `rock_dem`, adresa snímok), majú „worked out from the
settings above“. Zlý kľúč, neznámy kraj či zdroj, ktorý vrstva nemá, zastaví
beh práve tu – po sekundách, nie o desať jobov neskôr.

## 6. Kód a stráže

- **Resolver** je [`workers/plan/options.py`](../workers/plan/options.py):
  `--region=<kraj>` alebo `--mountain=<pohorie>`, výstupy `opt_*` ako predtým,
  takže joby pod ním sa nemenili. Pribudli `opt_rock_slope`,
  `opt_aerial_summer`/`_winter` (+ `_url`, `_minzoom`, `_maxzoom`) a
  `opt_aerial_sources` (JSON pre maticu sezón). `--options` a `--*-source`
  ostali len pre beh ručne.
- **Snímky:** [`workers/mountain/aerial.py`](../workers/mountain/aerial.py)
  berie `--source=<kľúč>` zo `sources.aerial`; cache dlaždíc je podľa zdroja.
- **Čítanie súboru:** [`workers/lib/map_settings.py`](../workers/lib/map_settings.py)
  (`load`, `sources`, `dem_sources`, `aerial_sources`, `credits`) – cez neho
  ho čítajú `options.py`, `packages.py`, DEM skripty, `outline.py` a linty.
- **Kredity:** [`workers/lint/credits.py`](../workers/lint/credits.py) stráži,
  že každý zdroj výšok aj snímok menuje známych autorov a každý balík druh
  zdroja, ktorý existuje.
- **Lint** [`workers/lint/settings.py`](../workers/lint/settings.py): `defaults`
  má presne kľúče z `DESCRIPTIONS`; krajiny a kraje sú z `regions.json`,
  pohoria z `mountains.json` a výber vo `mountain.yml` sa s nimi zhoduje;
  každá krajina, ktorú formulár stavia, má záznam; zdroje výšok sedia s `for`
  v `sources.dem`, zdroje snímok majú sezónu, adresu a známych autorov;
  každý cieľ formulára sa rozlúšti; **a žiadny z piatich formulárov nemá
  vstup s nastavením.** [`workers/lint/state.py`](../workers/lint/state.py)
  stráži, že každý kraj dávky má `reuse_layers: true`.
- **Testy** v `workers/tests/test_options.py` (`Layers`): najpresnejšie
  vyhráva, pohorie nič zo Slovenska, JSON typy, neznáme kľúče, sezóna zdroja;
  v `test_catalog.py` a `test_mountain.py` kredit snímok podľa zdroja.
- Pred zmenou sa porovnal starý `options.py` s formulárovými defaultmi
  s novým pre všetkých 34 krajov (s testom aj bez) a 8 pohorí: hodnoty sú
  zhodné.

## 7. Ďalej

1. **Zimné snímky a poľská strana Tatier** – zdroj s licenciou; súbor naň má
   miesto (`sources.aerial`, `covers`, autori v `credits`).
2. *(len ak bude treba)* `regions.json`, `areas.json` a `mountains.json` do
   toho istého súboru.
