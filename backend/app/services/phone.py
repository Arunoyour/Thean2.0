import re


def normalize_phone_number(phone_number: str) -> str:
    normalized = re.sub(r"[^\d+]", "", phone_number.strip())
    if normalized.startswith("00"):
        normalized = f"+{normalized[2:]}"
    if not normalized.startswith("+"):
        normalized = f"+91{normalized}"
    return normalized

