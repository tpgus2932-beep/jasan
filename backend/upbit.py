import base64
import hashlib
import hmac
import json
import os
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import urlencode, unquote

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


class UpbitConfigError(RuntimeError):
    pass


class UpbitAPIError(RuntimeError):
    pass


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _jwt(access_key: str, secret_key: str, params: dict[str, Any] | None = None) -> str:
    payload: dict[str, Any] = {
        "access_key": access_key,
        "nonce": str(uuid.uuid4()),
    }
    if params:
        query_string = unquote(urlencode(params, doseq=True))
        payload["query_hash"] = hashlib.sha512(query_string.encode("utf-8")).hexdigest()
        payload["query_hash_alg"] = "SHA512"

    header = {"alg": "HS512", "typ": "JWT"}
    signing_input = ".".join([
        _b64url(json.dumps(header, separators=(",", ":")).encode("utf-8")),
        _b64url(json.dumps(payload, separators=(",", ":")).encode("utf-8")),
    ])
    signature = hmac.new(secret_key.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha512).digest()
    return f"{signing_input}.{_b64url(signature)}"


def _to_float(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


class UpbitClient:
    def __init__(self):
        _load_dotenv()
        self.access_key = _env("UPBIT_ACCESS_KEY")
        self.secret_key = _env("UPBIT_SECRET_KEY")
        self.base_url = _env("UPBIT_API_HOST", "https://api.upbit.com")
        self.timeout = float(_env("UPBIT_TIMEOUT", "10") or 10)
        if not self.access_key or not self.secret_key:
            raise UpbitConfigError("UPBIT_ACCESS_KEY and UPBIT_SECRET_KEY must be set in backend/.env")

    async def accounts(self) -> list[dict[str, Any]]:
        token = _jwt(self.access_key, self.secret_key)
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(f"{self.base_url}/v1/accounts", headers=headers)
        if resp.status_code >= 400:
            raise UpbitAPIError(f"Upbit accounts request failed: {resp.status_code} {resp.text[:500]}")
        return resp.json()

    async def tickers(self, markets: list[str]) -> dict[str, float]:
        if not markets:
            return {}
        params = {"markets": ",".join(markets)}
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(f"{self.base_url}/v1/ticker", params=params, headers={"Accept": "application/json"})
        if resp.status_code >= 400:
            raise UpbitAPIError(f"Upbit ticker request failed: {resp.status_code} {resp.text[:500]}")
        return {row["market"]: _to_float(row.get("trade_price")) for row in resp.json()}

    async def portfolio(self) -> dict[str, Any]:
        accounts = await self.accounts()
        coin_accounts = [
            row for row in accounts
            if row.get("currency") and row.get("currency") != "KRW"
            and (_to_float(row.get("balance")) + _to_float(row.get("locked"))) > 0
        ]
        markets = [f"KRW-{row['currency']}" for row in coin_accounts]
        prices = await self.tickers(markets)

        positions = []
        total = 0.0
        for row in coin_accounts:
            currency = row["currency"]
            market = f"KRW-{currency}"
            balance = _to_float(row.get("balance"))
            locked = _to_float(row.get("locked"))
            quantity = balance + locked
            avg_buy_price = _to_float(row.get("avg_buy_price"))
            price = prices.get(market, 0.0)
            value = quantity * price
            total += value
            positions.append({
                "market": market,
                "currency": currency,
                "balance": balance,
                "locked": locked,
                "quantity": quantity,
                "avg_buy_price": avg_buy_price,
                "price": price,
                "value": value,
                "profit": value - quantity * avg_buy_price if avg_buy_price else 0.0,
                "raw": row,
            })

        krw_cash = sum(
            _to_float(row.get("balance")) + _to_float(row.get("locked"))
            for row in accounts if row.get("currency") == "KRW"
        )
        return {"positions": positions, "total": total, "krw_cash": krw_cash, "accounts": accounts}
