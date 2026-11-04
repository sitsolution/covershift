"""The app's clock.

Timestamps are stored without a zone and read as IST: the DB session runs on
+05:30 (see database.py), so server defaults like created_at are IST. Anything
Python writes or compares against those columns must use IST too; a UTC "now"
lands 5½ hours behind and shows the wrong time or matches the wrong rows.
"""

from datetime import date, datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))


def now_ist() -> datetime:
    """Current time as a naive IST datetime, for writing and querying DB columns."""
    return datetime.now(IST).replace(tzinfo=None)


def today_ist() -> date:
    """Today's date in India. date.today() uses the server's UTC clock, which is
    still yesterday until 5:30 AM IST."""
    return datetime.now(IST).date()
