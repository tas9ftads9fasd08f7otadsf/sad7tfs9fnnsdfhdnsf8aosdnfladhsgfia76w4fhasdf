# Nastavenia máp v jednom JSON

Návrh (október 2026, tiket 381), nie popis hotového stavu. Jeden súbor
`workers/data/map-settings.json` povie, s čím sa mapa robí: pre krajinu,
presnejšie pre kraj a pre pohorie – výškový model, letecké snímky, vrstevnice,
skaly, zoomy – a pri každom zdroji aj jeho autora a licenciu. Pipeliny ho čítajú
a jeho hodnoty sú predvolené hodnoty formulára „Run workflow“.

## 1. Dnes: jedno nastavenie na deviatich miestach

| Čo | Kde je dnes |
|---|---|
| predvolené prepínače a zoomy (`contour_interval=5`, `contour_maxzoom=14`, `size_limit_mb=900`, …) | `OPTIONS` v `workers/plan/options.py` |
| výškový model vrstevníc, skál a tieňovania (`dmr5`) | `default:` vo štyroch formulároch (`build-map-region`, `build-map-state`, `regenerate-region`, …) |
| model pohoria | natvrdo `--contour-source=dmr5 …` v `mountain.yml` |
| čím sa pohorie líši (`contour_interval=2.5`, `terrain_maxzoom=16`, `size_limit_mb=2000`) | `MOUNTAIN_OPTIONS` v `mountain.yml` |
| sklon skál (`50`) | `default:` v každom formulári zvlášť |
| krajina bez modelu (Česko, Rakúsko) | `dem: false` v `regions.json` |
| letecké snímky a ich zoomy | `aerial.json` – jeden zdroj na sezónu pre všetky pohoria |
| zoznam modelov | `dem-sources.json` |
| autori a licencie | `credits.json`, a ktorý balík ich nesie, v `packages.json` |

Z toho plynú tri chyby, ktoré sa už stali alebo stanú:

- **Snímky nemajú kredit podľa zdroja.** `aerial_summer` aj `aerial_winter`
  majú v `packages.json` natvrdo `ortofoto` + `freemap`. Zima by s iným zdrojom
  (napr. zimné snímky inej firmy) niesla cudzí kredit.
- **Pohorie si nevyberie zdroj.** Poľská strana Tatier ostáva bez snímok, lebo
  `aerial.json` má jednu adresu pre všetkých; pohorie nemôže povedať „leto
  odtiaľto, zima odtiaľto“.
- **Formulár hovorí niečo iné než región.** `build-map-state` ponúka `dmr5` aj
  pre Česko, kde nie je; `options.py` to potom potichu vypne. Predvolená hodnota
  formulára nevie o krajine, ktorú v ňom človek vyberie.

## 2. Súbor

`workers/data/map-settings.json` má štyri časti:

```jsonc
{
  "_comment": ["…"],

  // kto je autor a pod akou licenciou; dnešný credits.json
  "credits": {
    "osm":      { "holder": "OpenStreetMap contributors", "work": "OpenStreetMap", "license": "ODbL 1.0", "…": "…" },
    "dmr5":     { "holder": "ÚGKK SR", "work": "DMR 5.0 (LiDAR)", "license": "CC BY 4.0", "copyright": false, "…": "…" },
    "ortofoto": { "holder": "GKÚ Bratislava, NLC Zvolen", "work": "Ortofotomozaika SR", "…": "…" },
    "freemap":  { "holder": "freemap.sk", "work": "Orthophoto tiles", "…": "…" }
  },

  // odkiaľ dáta idú; každý zdroj menuje svoje kredity
  "sources": {
    "dem": {
      "dmr5":  { "label": "DMR 5.0", "kind": "sklad", "store": "dem-dmr5-v2", "cell_m": 1, "for": ["contours", "rocks", "shading"], "covers": ["SK"], "credits": ["dmr5"] },
      "sonny": { "label": "Sonny's LiDAR DTM 20m", "kind": "sklad", "store": "dem-sonny", "cell_m": 20, "for": ["contours", "rocks", "shading"], "credits": ["sonny"] }
    },
    "aerial": {
      "ofmozaika_sk": {
        "label": "Ortofotomozaika SR (freemap.sk)",
        "season": "summer",
        "url": "https://ofmozaika2c.tiles.freemap.sk/{z}/{x}/{y}.jpg",
        "minzoom": 8, "maxzoom": 17,
        "covers": ["SK"],
        "jobs": 4,
        "credits": ["ortofoto", "freemap"]
      }
    }
  },

  // všetko, čo sa dá nastaviť, s hodnotou pre každú mapu
  "defaults": {
    "contours": { "source": "dmr5", "interval": 5, "maxzoom": 14, "maxzoom_cap": 14 },
    "rocks":    { "source": "dmr5", "slope": 50 },
    "terrain":  { "source": "dmr5", "maxzoom": "auto" },
    "aerial":   { "summer": null, "winter": null },
    "maxzoom": 16,
    "size_limit_mb": 900
  },

  // presnejšie: krajina → kraj, pohorie
  "countries": {
    "slovensko": {
      "settings": {},
      "regions": {
        "zilinsky": { "settings": { "rocks": { "slope": 45 } } }
      }
    },
    "cesko":   { "settings": { "contours": { "source": "none" }, "rocks": { "source": "none" }, "terrain": { "source": "none" } } },
    "rakusko": { "settings": { "contours": { "source": "none" }, "rocks": { "source": "none" }, "terrain": { "source": "none" } } }
  },
  "mountains": {
    "vysoke_tatry": {
      "country": "slovensko",
      "area": "vysoke_tatry",
      "countries": ["SK", "PL"],
      "osm": ["europe/slovakia-latest", "europe/poland/malopolskie-latest"],
      "settings": {
        "contours": { "interval": 2.5, "maxzoom": 16, "maxzoom_cap": 16, "lowland_m": 0 },
        "terrain":  { "maxzoom": 16 },
        "aerial":   { "summer": "ofmozaika_sk", "winter": null },
        "size_limit_mb": 2000
      }
    }
  }
}
```

(`jsonc` len kvôli poznámkam v tomto návrhu; súbor je čistý JSON s `_comment`
ako ostatné v `workers/data/`.)

**Čo sa doň zlúči a zmizne:** `aerial.json`, `dem-sources.json`,
`credits.json`, `mountains.json`, kľúč `dem` z `regions.json`, `OPTIONS`
z `options.py` (ostanú tam len popisy a kontroly), `MOUNTAIN_OPTIONS`
z `mountain.yml`.

**Čo ostane, kde je:** `regions.json` (id, meno, bbox, `osmfr`, `admin_level`)
a `areas.json` (výrezy). To nie sú nastavenia, ale geografia – kde mapa leží
a odkiaľ je jej PBF – a číta ich ~25 skriptov. Nastavenia sa na ne odvolávajú
kľúčom (`countries.slovensko.regions.zilinsky` = `regions.json` `zilinsky`).
Zlúčiť aj ich sa dá neskôr (fáza 5), ale nič to nekupuje a riziko je veľké.

## 3. Dedenie: od všeobecného k presnému

Hodnota sa hľadá od najpresnejšieho miesta, prvá nájdená vyhráva:

```
options (voľný text vo formulári)       contour_interval=10
  ↑ vstup formulára, ak nie je „config“  contour_source: sonny
  ↑ mountains.<pohorie>.settings        interval 2.5
  ↑ countries.<krajina>.regions.<kraj>  slope 45
  ↑ countries.<krajina>.settings        source none (Česko)
  ↑ defaults                            všetko
```

- Kraj dedí od svojej krajiny cez `country` v `regions.json`, pohorie cez svoje
  `country`. Kraj bez záznamu v `regions` berie krajinu celú.
- Zlučuje sa po kľúčoch do hĺbky: `{"contours": {"interval": 2.5}}` zmení len
  interval, zdroj ostane zdedený.
- `null` znamená „nemá“ (zima bez snímok), nie „zdeď“. Zdediť = kľúč vynechať.
- Každá výsledná hodnota si pamätá, odkiaľ prišla (`defaults`,
  `countries.slovensko`, `mountains.vysoke_tatry`, `form`, `options`). To ide do
  súhrnu behu (§5).

## 4. Zdroje a ich kredity

Kredit patrí **zdroju**, nie balíku. Balík v `packages.json` povie len, aký
druh zdroja nesie:

```json
{ "key": "aerial_summer", "sources": ["aerial:summer"] }
{ "key": "contours",      "sources": ["author", "dem:contours"] }
```

`dem:contours` sa už dnes rozkladá na model, z ktorého boli vrstevnice
(`workers/deploy/packages.py`). Pribudne `aerial:<sezóna>` → zdroj, ktorý
pohorie pre sezónu vybralo → jeho `credits`. Zdroj bez kreditu, alebo kredit,
ktorý v `credits` nie je, je chyba lintu (`workers/lint/credits.py` to dnes
robí pre `dem:*`).

Zdroj má aj `covers` (ISO krajín). Pohorie v SK + PL so zdrojom, ktorý pokrýva
len SK, dostane v súhrne poznámku „za hranicou PL snímky nebudú“ – dnes to stojí
len v README. Keď pribudne poľský zdroj, pohorie môže mať pre sezónu **zoznam**
zdrojov (`"summer": ["ofmozaika_sk", "geoportal_pl"]`), prvý vyhráva tam, kde
má dlaždicu. To je samostatný tiket; súbor naň má miesto už teraz.

## 5. Formulár „Run workflow“

**Čo GitHub nedovolí:** `default:` vstupu `workflow_dispatch` je text v YAML.
GitHub ho číta, keď kreslí formulár; nijaký súbor z repozitára si pritom
neprečíta a ani nevie, aký kraj človek o riadok vyššie vybral. Formulár teda
hodnotu z JSON **ukázať** nevie.

**Ako to obísť:** predvolená hodnota formulára bude slovo `config` (pri `choice`
prvá možnosť) alebo prázdny text (pri `string`), čo znamená „vezmi z
`map-settings.json` pre to, čo som vybral“. Konkrétne číslo sa doplní v prvom
jobe behu:

```yaml
contour_source:
  description: "Vrstevnice z (config = map-settings.json pre zvolený kraj)"
  type: choice
  default: config
  options: [config, sonny, sonny1, dmr35, dmr5, none]
rock_slope:
  description: "Sklon skál v ° (prázdne = map-settings.json)"
  type: string
  default: ""
```

Job `settings` (dnes `workers/plan/settings.sh`) vypíše do súhrnu tabuľku:

| Nastavenie | Hodnota | Odkiaľ |
|---|---|---|
| contours.source | dmr5 | defaults |
| contours.interval | 2.5 | mountains.vysoke_tatry |
| rocks.slope | 40 | formulár |
| aerial.summer | ofmozaika_sk (GKÚ, NLC; freemap.sk) | mountains.vysoke_tatry |

Na telefóne je teda hneď vidno, s čím beh ide, hoci vo formulári stálo
`config`.

**Prečo nie generovať `default:` z JSON.** Dalo by sa skriptom prepísať
`default:` vo YAML podľa `defaults` a lintom strážiť, že sa nerozišli. Lenže
platí len pre hodnoty rovnaké pre všetky kraje – a práve tie, o ktoré tu ide
(model, snímky, interval), sa podľa kraja a pohoria líšia. Formulár by ukazoval
`dmr5` aj pri Česku. Preto `config` všade, kde môže hodnota závisieť od cieľa.

**„Re-run“** starého behu nesie `config`, takže zoberie **dnešný** JSON, nie
ten z pôvodného behu. Súhrn pôvodného behu (tabuľka vyššie) je záznam toho, s
čím išiel; kto chce presne to isté, prepíše hodnoty do formulára.

**Beh spustený iným behom** (`build-map-state` spúšťa kraje cez API) posiela
ďalej len to, čo človek zmenil, a zvyšok `config` – kraj si vezme svoje, nie
hodnotu krajiny.

## 6. Kto to číta: `workers/plan/settings.py`

Jeden resolver, nič iné JSON priamo nečíta:

```
python3 workers/plan/settings.py --region=zilinsky \
    --form-contour-source=config --form-rock-slope= --options="$OPTIONS" \
    --out="$GITHUB_OUTPUT" --summary="$GITHUB_STEP_SUMMARY"
python3 workers/plan/settings.py --mountain=vysoke_tatry …
```

- Vráti ploché `opt_*` výstupy, aké dnes dáva `options.py`
  (`opt_contour_source`, `opt_contour_interval`, …), takže joby pod ním sa
  nemenia. Pribudnú `opt_aerial_summer_url`, `opt_aerial_summer_maxzoom`,
  `opt_aerial_summer_credits`.
- `options.py` ostane pre voľný text `options`: rozloží ho a skontroluje, ale
  predvolené hodnoty už berie zo `settings.py`.
- `aerial.py` dostane zdroj (`--source=ofmozaika_sk`), nie sezónu, a URL, zoomy,
  počet spojení si vezme zo zdroja.
- Python knižnica v `workers/lib/settings.py` (`load()`, `resolve(target)`), aby
  `catalog.py`, `packages.py`, `names.py` a linty nečítali súbor každý po svojom.

## 7. Stráže

- **Schéma** `workers/data/map-settings.schema.json` + krok v
  `Check · catalog schema`: neznámy kľúč v `settings` je chyba (preklep
  `intervall` by sa inak potichu zdedil z `defaults`).
- **Lint** `workers/lint/settings.py`:
  - každý `source` v `settings` je v `sources` a má `for` toho druhu;
  - každý `credits` je v `credits`;
  - kľúče v `countries` a `regions` sú v `regions.json`, `area` pohoria v
    `areas.json`;
  - `options:` každého `choice` vstupu sú `config` + kľúče `sources.dem`
    (dnes to pre `dem-sources.json` robí `lint-workflows.yml`);
  - každý vstup s `config` / prázdnym defaultom má kľúč v `defaults`.
- **Testy** `workers/tests/test_settings.py`: dedenie (kraj prepíše krajinu,
  `null` nededí, hlboké zlúčenie), priorita formulár > JSON, `options` >
  formulár, `odkiaľ` v súhrne, kredit snímok podľa zdroja.

## 8. Fázy

Každá fáza je vlastné PR, pipeline po každej beží ako predtým.

1. **Súbor a resolver.** `map-settings.json` z dnešných hodnôt (presne tie isté
   čísla), `workers/lib/settings.py`, `workers/plan/settings.py`, schéma, lint,
   testy. Nikto ho ešte nečíta – overí sa, že pre každý kraj a pohorie vráti to
   isté, čo dnes `options.py` + formulár (test porovná oboje).
2. **Pohoria.** `mountain.yml` číta `settings.py`; zmizne `MOUNTAIN_OPTIONS`,
   natvrdo `dmr5` a `mountains.json`. `aerial.py` berie zdroj. Kredit snímok
   cez `aerial:<sezóna>`; zmizne `aerial.json`.
3. **Kraje a krajiny.** `build-map-region`, `build-map-state`,
   `regenerate-region`, `regenerate-state` dostanú `config` defaulty a čítajú
   `settings.py`. Zmizne `dem: false` z `regions.json` a predvolené hodnoty z
   `OPTIONS`.
4. **Zvyšok.** `shading-rocks.yml`, `update-dem.yml`, `dmr5-drive.yml`,
   `catalog.py`, `packages.py`, `names.py` a linty cez `workers/lib/settings.py`;
   zmiznú `dem-sources.json` a `credits.json`. README dostane kapitolu o súbore
   namiesto dnešných odsekov o každom z nich.
5. *(len ak bude treba)* `regions.json` a `areas.json` do toho istého súboru.

Aplikácia (`skifahrer/rikimaps`) sa nemení: kredity číta z `maps.json` ako
doteraz, len budú správne podľa zdroja.

## 9. Otvorené otázky

- **Meno súboru.** `map-settings.json` sa nepletie s `maps.json` (katalóg) ani
  s jobom `settings`. Iný návrh?
- **Geografia mimo** (§2): stačí, že `regions.json` a `areas.json` ostanú
  samostatne, alebo naozaj všetko v jednom súbore?
- **Zimné snímky a poľská strana Tatier**: aký zdroj? Plán na ne má miesto
  (`sources.aerial`, zoznam zdrojov na sezónu), ale adresu a licenciu treba
  vybrať.
- **Nastavenia na úrovni výrezu** (`areas.json`, vstup `area` v
  `build-map-region`): treba aj štvrtú úroveň, alebo stačí pohorie?
