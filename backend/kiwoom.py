import os
import json
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


class KiwoomConfigError(RuntimeError):
    pass


class KiwoomAPIError(RuntimeError):
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


def yahoo_ticker_from_kiwoom(value: Any) -> str:
    code = normalize_stock_code(value)
    return f"{code}.KS" if code.isdigit() and len(code) == 6 else code


class KiwoomClient:
    def __init__(self):
        _load_dotenv()
        self.appkey = _env("KIWOOM_APP_KEY")
        self.secretkey = _env("KIWOOM_APP_SECRET")
        self.mock = _env("KIWOOM_USE_MOCK", "false").lower() in ("1", "true", "yes", "y")
        self.host = _env("KIWOOM_API_HOST") or (
            "https://mockapi.kiwoom.com" if self.mock else "https://api.kiwoom.com"
        )
        self.timeout = float(_env("KIWOOM_TIMEOUT", "15") or 15)
        self.exchange = _env("KIWOOM_DMST_STEX_TP", "KRX") or "KRX"

        if not self.appkey or not self.secretkey:
            raise KiwoomConfigError("KIWOOM_APP_KEY and KIWOOM_APP_SECRET must be set in backend/.env")

    async def token(self) -> str:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{self.host}/oauth2/token",
                headers={"Content-Type": "application/json;charset=UTF-8"},
                json={
                    "grant_type": "client_credentials",
                    "appkey": self.appkey,
                    "secretkey": self.secretkey,
                },
            )
        if resp.status_code >= 400:
            raise KiwoomAPIError(f"Kiwoom token request failed: {resp.status_code} {resp.text[:300]}")
        data = json.loads(resp.content.decode("utf-8-sig"))
        token = data.get("token") or data.get("access_token")
        if not token:
            raise KiwoomAPIError("Kiwoom token response did not include token")
        return token

    async def _post_tr(self, token: str, api_id: str, body: dict[str, Any]) -> tuple[dict[str, Any], dict[str, str]]:
        headers = {
            "Content-Type": "application/json;charset=UTF-8",
            "authorization": f"Bearer {token}",
            "api-id": api_id,
        }
        all_body: dict[str, Any] = {}
        cont_yn = "N"
        next_key = ""

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            for _ in range(20):
                req_headers = dict(headers)
                if next_key:
                    req_headers["cont-yn"] = cont_yn
                    req_headers["next-key"] = next_key
                resp = await client.post(f"{self.host}/api/dostk/acnt", headers=req_headers, json=body)
                if resp.status_code >= 400:
                    raise KiwoomAPIError(f"Kiwoom {api_id} failed: {resp.status_code} {resp.text[:500]}")
                data = json.loads(resp.content.decode("utf-8-sig"))
                self._merge_body(all_body, data)

                cont_yn = resp.headers.get("cont-yn", "N")
                next_key = resp.headers.get("next-key", "")
                if cont_yn != "Y" or not next_key:
                    return all_body, {"cont-yn": cont_yn, "next-key": next_key, "api-id": api_id}

        raise KiwoomAPIError(f"Kiwoom {api_id} pagination did not finish")

    def _merge_body(self, target: dict[str, Any], source: dict[str, Any]) -> None:
        for key, value in source.items():
            if isinstance(value, list):
                target.setdefault(key, [])
                if isinstance(target[key], list):
                    target[key].extend(value)
                else:
                    target[key] = value
            elif key not in target or target[key] in (None, ""):
                target[key] = value

    async def account_balance(self) -> dict[str, Any]:
        token = await self.token()
        body = {
            "qry_tp": _env("KIWOOM_BALANCE_QRY_TP", "1") or "1",
            "dmst_stex_tp": self.exchange,
        }

        account_no = _env("KIWOOM_ISA_ACCOUNT_NO")
        account_field = _env("KIWOOM_ACCOUNT_FIELD")
        if account_no and account_field:
            body[account_field] = account_no

        raw, meta = await self._post_tr(token, "kt00018", body)
        positions = self._extract_positions(raw)
        total = self._extract_total(raw, positions)
        return {"positions": positions, "total": total, "raw": raw, "meta": meta}

    def _extract_positions(self, body: dict[str, Any]) -> list[dict[str, Any]]:
        candidates = []
        for key in (
            "acnt_evlt_remn_indv_tot",
            "acnt_evlt_remn",
            "stk_acnt_evlt_remn",
            "stk_acnt_evlt_remn_indv_tot",
            "output2",
            "items",
            "list",
        ):
            value = body.get(key)
            if isinstance(value, list):
                candidates.extend(value)

        if not candidates:
            candidates = self._find_position_lists(body)

        positions = []
        for row in candidates:
            if not isinstance(row, dict):
                continue
            code = _pick(row, ["stk_cd", "stkcd", "code", "isu_cd", "pdno", "종목번호", "종목코드"])
            qty = _to_number(_pick(row, ["rmnd_qty", "poss_qty", "hldg_qty", "stk_qty", "qty", "보유수량", "잔고수량"]))
            if not code or qty == 0:
                continue
            price = abs(_to_number(_pick(row, ["cur_prc", "prpr", "now_prc", "price", "현재가"])))
            eval_amt = abs(_to_number(_pick(row, ["evlt_amt", "evltv", "bal_amt", "평가금액", "보유금액"])))
            if price == 0 and qty:
                price = eval_amt / qty if eval_amt else 0
            positions.append({
                "ticker": yahoo_ticker_from_kiwoom(code),
                "code": normalize_stock_code(code),
                "name": str(_pick(row, ["stk_nm", "stk_nm_kor", "name", "isu_nm", "종목명"], "")).strip(),
                "shares": qty,
                "price": price,
                "value": eval_amt or qty * price,
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
                if keys & {"stk_cd", "stkcd", "종목번호", "종목코드", "pdno"}:
                    score += 1
                if keys & {"rmnd_qty", "poss_qty", "보유수량", "잔고수량"}:
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
        for key in (
            "tot_evlt_amt",
            "evlt_amt",
            "tot_stk_evlt_amt",
            "aset_evlt_amt",
            "d2_entra",
            "총평가금액",
            "추정예탁자산",
        ):
            value = _to_number(body.get(key))
            if value:
                return abs(value)
        return sum(float(p["value"]) for p in positions)
