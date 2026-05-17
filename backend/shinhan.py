import json
import os
from pathlib import Path
from typing import Any

import httpx


def _load_dotenv():
    env_path = Path(__file__).with_name(".env")
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv()


class ShinhanConfigError(RuntimeError):
    pass


class ShinhanAPIError(RuntimeError):
    pass


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _to_number(value: Any) -> float:
    if value is None:
        return 0.0
    text = str(value).strip().replace(",", "").replace("%", "")
    if not text:
        return 0.0
    sign = -1 if text.startswith("-") else 1
    text = text.lstrip("+-")
    try:
        return sign * float(text)
    except ValueError:
        return 0.0


def _pick(row: dict[str, Any], keys: list[str], default: Any = "") -> Any:
    for key in keys:
        if key in row and row[key] not in (None, ""):
            return row[key]
    return default


def normalize_stock_code(value: Any) -> str:
    code = str(value or "").strip().upper()
    code = code.removeprefix("A")
    if "_" in code:
        code = code.split("_", 1)[0]
    if "." in code:
        code = code.split(".", 1)[0]
    digits = "".join(ch for ch in code if ch.isdigit())
    return digits[-6:] if len(digits) >= 6 else code


def yahoo_ticker_from_shinhan(value: Any) -> str:
    code = normalize_stock_code(value)
    return f"{code}.KS" if code.isdigit() and len(code) == 6 else code


class ShinhanClient:
    def __init__(self):
        _load_dotenv()
        self.api_url = _env("SHINHAN_ISA_API_URL")
        self.api_key = _env("SHINHAN_ISA_API_KEY")
        self.bearer_token = _env("SHINHAN_ISA_BEARER_TOKEN")
        self.timeout = float(_env("SHINHAN_ISA_TIMEOUT", "15") or 15)
        if not self.api_url:
            raise ShinhanConfigError("SHINHAN_ISA_API_URL must be set in backend/.env")

    async def account_balance(self) -> dict[str, Any]:
        headers = {"Accept": "application/json"}
        if self.api_key:
            headers["x-api-key"] = self.api_key
        if self.bearer_token:
            headers["Authorization"] = f"Bearer {self.bearer_token}"

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(self.api_url, headers=headers)

        if resp.status_code >= 400:
            raise ShinhanAPIError(f"Shinhan ISA request failed: {resp.status_code} {resp.text[:500]}")

        try:
            data = json.loads(resp.content.decode("utf-8-sig"))
        except Exception as exc:
            raise ShinhanAPIError(f"Shinhan ISA response is not valid JSON: {exc}") from exc

        positions = self._extract_positions(data)
        total = self._extract_total(data, positions)
        return {"positions": positions, "total": total, "raw": data, "meta": {"api_url": self.api_url}}

    def _extract_positions(self, body: dict[str, Any]) -> list[dict[str, Any]]:
        candidates = []
        for key in ("positions", "holdings", "items", "list", "stocks", "data"):
            value = body.get(key)
            if isinstance(value, list):
                candidates.extend(value)

        if not candidates:
            candidates = self._find_position_lists(body)

        positions = []
        for row in candidates:
            if not isinstance(row, dict):
                continue
            code = _pick(row, ["ticker", "code", "stock_code", "symbol", "item_code", "pdno"])
            qty = _to_number(_pick(row, ["shares", "quantity", "qty", "holding_quantity", "balance_qty"]))
            if not code or qty == 0:
                continue
            price = abs(_to_number(_pick(row, ["price", "current_price", "last_price", "now_price"])))
            value = abs(_to_number(_pick(row, ["value", "amount", "evaluation_amount", "market_value"])))
            if price == 0 and qty:
                price = value / qty if value else 0
            positions.append({
                "ticker": yahoo_ticker_from_shinhan(code),
                "code": normalize_stock_code(code),
                "name": str(_pick(row, ["name", "stock_name", "item_name"], "")).strip(),
                "shares": qty,
                "price": price,
                "value": value or qty * price,
                "raw": row,
            })
        return positions

    def _find_position_lists(self, value: Any) -> list[dict[str, Any]]:
        found: list[dict[str, Any]] = []
        if isinstance(value, list):
            dicts = [item for item in value if isinstance(item, dict)]
            score = 0
            for row in dicts:
                keys = set(row.keys())
                if keys & {"ticker", "code", "stock_code", "symbol", "item_code", "pdno"}:
                    score += 1
                if keys & {"shares", "quantity", "qty", "holding_quantity", "balance_qty"}:
                    score += 1
            if score:
                found.extend(dicts)
            for item in value:
                found.extend(self._find_position_lists(item))
        elif isinstance(value, dict):
            for child in value.values():
                found.extend(self._find_position_lists(child))
        return found

    def _extract_total(self, body: dict[str, Any], positions: list[dict[str, Any]]) -> float:
        for key in ("total", "total_value", "evaluation_amount", "asset_value", "balance"):
            value = _to_number(body.get(key))
            if value:
                return abs(value)
        return sum(float(p["value"]) for p in positions)
