import json
import sqlite3

from backend.app.matching.names import arabic_key, latin_key
from backend.app.schemas import SanctionsResult, WatchlistMatch


def check_sanctions_watchlist(conn: sqlite3.Connection, name: str, name_ar: str | None = None,
                              dob: str | None = None, nationality: str | None = None) -> SanctionsResult:
    """Name match + DOB corroboration => HIT; name match without corroboration => POSSIBLE."""
    matches: list[WatchlistMatch] = []
    subject_latin = latin_key(name)
    subject_ar = arabic_key(name_ar) if name_ar else None
    for row in conn.execute("SELECT * FROM watchlist ORDER BY record_id"):
        matched_on = None
        if latin_key(row["name"]) == subject_latin:
            matched_on = "name"
        elif any(latin_key(a) == subject_latin for a in json.loads(row["aliases"])):
            matched_on = "alias"
        elif subject_ar and row["name_ar"] and arabic_key(row["name_ar"]) == subject_ar:
            matched_on = "name_ar"
        if matched_on is None:
            continue
        dob_match = None if not (dob and row["dob"]) else dob == row["dob"]
        nat_match = None if not (nationality and row["nationality"]) else nationality == row["nationality"]
        band = "HIT" if dob_match is True and nat_match is not False else "POSSIBLE"
        matches.append(WatchlistMatch(watchlist_id=row["record_id"], listed_name=row["name"], screened_name=name,
                                      matched_on=matched_on, dob_match=dob_match, nationality_match=nat_match,
                                      band=band))
    band = "HIT" if any(m.band == "HIT" for m in matches) else ("POSSIBLE" if matches else "CLEAR")
    return SanctionsResult(band=band, matches=matches, screened_names=[name] + ([name_ar] if name_ar else []),
                           record_ids=[m.watchlist_id for m in matches])
