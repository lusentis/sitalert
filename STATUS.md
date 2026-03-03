# SitAlert Collector — Source Status

## Structured Adapters (10 total)

| # | Source | Adapter | Config Key | Polling | Enabled | Coords | Status |
|---|--------|---------|------------|---------|---------|--------|--------|
| 1 | USGS Earthquakes | `usgs.ts` | `usgs` | 1 min | Yes | GeoJSON | Deployed, updated to `all_hour` |
| 2 | EMSC Seismic Portal | `emsc.ts` | `emsc` | 1 min | Yes | GeoJSON | Deployed, removed `minmag=3` filter |
| 3 | GDACS Global Disasters | `gdacs.ts` | `gdacs` | 5 min | Yes | `georss:point` / `geo:Point` | Deployed |
| 4 | NASA FIRMS Active Fires | `nasa-firms.ts` | `nasa_firms` | 15 min | Yes | CSV lat/lng clusters | Deployed (requires `NASA_FIRMS_API_KEY`) |
| 5 | ReliefWeb Disasters | `reliefweb.ts` | `reliefweb` | 15 min | Yes | No coords (geocoded via pipeline) | Deployed |
| 6 | GeoNet NZ Earthquakes | `geonet-nz.ts` | `geonet_nz` | 1 min | Yes | GeoJSON | Deployed |
| 7 | USGS Volcanoes | `usgs-volcanoes.ts` | `usgs_volcanoes` | 1 hr | Yes | From notice API (lat/lng) | Deployed |
| 8 | WHO Disease Outbreaks | `who-outbreaks.ts` | `who_outbreaks` | 6 hr | Yes | No coords (geocoded via pipeline) | Deployed |
| 9 | NOAA NHC (Hurricanes) | `noaa-nhc.ts` | `noaa_nhc` | 10 min | Yes | `georss:point` | Deployed |
| 10 | Smithsonian GVP (Volcanoes) | `smithsonian-gvp.ts` | `smithsonian_gvp` | 24 hr | Yes | `georss:point` | Deployed |

## OSINT Adapters (3 total)

| # | Source | Adapter | Enabled | Status |
|---|--------|---------|---------|--------|
| 1 | Telegram (18 channels) | `telegram.ts` | No | Requires MTProto session, channel list updated |
| 2 | News RSS (8 feeds) | `rss.ts` | No | Reuters, BBC, Al Jazeera, France24, DW, NHK, ProMED, ANSA |
| 3 | Travel Advisories | `travel-advisories.ts` | No | US State Dept + UK FCDO |

## Pipeline Processing

| Component | Model/Engine | Status |
|-----------|-------------|--------|
| Classifier | `gpt-5-nano` | Updated from `gpt-4o-mini` |
| Geocoder | Nominatim via Redis cache | Deployed |
| Deduplicator | DB-backed with source merge | Deployed |
