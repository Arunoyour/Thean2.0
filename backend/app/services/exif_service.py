"""Extract GPS coordinates and timestamp from image EXIF data using Pillow."""
from __future__ import annotations

import io
from datetime import datetime, timezone
from typing import NamedTuple

from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS


class ExifData(NamedTuple):
    taken_at: datetime | None
    lat: float | None
    lng: float | None


def _dms_to_decimal(dms, ref: str) -> float:
    degrees, minutes, seconds = dms
    decimal = float(degrees) + float(minutes) / 60 + float(seconds) / 3600
    if ref in ("S", "W"):
        decimal = -decimal
    return decimal


def extract_exif(image_bytes: bytes) -> ExifData:
    """Return (taken_at, lat, lng) from image bytes. Any field may be None."""
    try:
        img = Image.open(io.BytesIO(image_bytes))
        raw = img._getexif()
        if not raw:
            return ExifData(None, None, None)

        exif = {TAGS.get(k, k): v for k, v in raw.items()}

        # Timestamp — prefer DateTimeOriginal, fall back to DateTime
        taken_at = None
        for key in ("DateTimeOriginal", "DateTime"):
            if key in exif:
                try:
                    taken_at = datetime.strptime(exif[key], "%Y:%m:%d %H:%M:%S").replace(tzinfo=timezone.utc)
                    break
                except ValueError:
                    pass

        # GPS
        lat = lng = None
        gps_raw = exif.get("GPSInfo")
        if gps_raw:
            gps = {GPSTAGS.get(k, k): v for k, v in gps_raw.items()}
            if "GPSLatitude" in gps and "GPSLatitudeRef" in gps:
                lat = _dms_to_decimal(gps["GPSLatitude"], gps["GPSLatitudeRef"])
            if "GPSLongitude" in gps and "GPSLongitudeRef" in gps:
                lng = _dms_to_decimal(gps["GPSLongitude"], gps["GPSLongitudeRef"])

        return ExifData(taken_at, lat, lng)
    except Exception:
        return ExifData(None, None, None)
