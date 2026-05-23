from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
import uuid
import asyncio
import httpx
import yfinance as yf
from concurrent.futures import ThreadPoolExecutor
from datetime import date

from database import engine, get_db, Base
import models
from kiwoom import KiwoomAPIError, KiwoomClient, KiwoomConfigError
from shinhan import ShinhanAPIError, ShinhanClient, ShinhanConfigError
from upbit import UpbitAPIError, UpbitClient, UpbitConfigError

Base.metadata.create_all(bind=engine)

app = FastAPI(title="자산관리 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def new_id():
    return str(uuid.uuid4())[:8]


# 기존 DB에 새 컬럼 추가 (이미 존재하면 무시)
@app.on_event("startup")
def migrate():
    migrations = [
        "ALTER TABLE yearly_records ADD COLUMN real_estate REAL DEFAULT 0",
        "ALTER TABLE savings ADD COLUMN monthly_payment REAL DEFAULT 0",
        "ALTER TABLE savings ADD COLUMN payment_day INTEGER DEFAULT 1",
        "ALTER TABLE savings ADD COLUMN last_paid_month TEXT DEFAULT ''",
        "ALTER TABLE overseas_holdings ADD COLUMN owner TEXT DEFAULT 'me'",
        "ALTER TABLE yearly_records ADD COLUMN crypto REAL DEFAULT 0",
        "ALTER TABLE yearly_records ADD COLUMN inv_savings REAL DEFAULT 0",
        "ALTER TABLE yearly_records ADD COLUMN inv_overseas REAL DEFAULT 0",
        "ALTER TABLE yearly_records ADD COLUMN inv_isa REAL DEFAULT 0",
        "ALTER TABLE yearly_records ADD COLUMN inv_crypto REAL DEFAULT 0",
        "ALTER TABLE yearly_records ADD COLUMN inv_real_estate REAL DEFAULT 0",
        "CREATE TABLE IF NOT EXISTS monthly_records (id TEXT PRIMARY KEY, year_month TEXT UNIQUE NOT NULL, savings REAL DEFAULT 0, overseas REAL DEFAULT 0, isa REAL DEFAULT 0, crypto REAL DEFAULT 0, real_estate REAL DEFAULT 0, other REAL DEFAULT 0, total REAL DEFAULT 0, inv_savings REAL DEFAULT 0, inv_overseas REAL DEFAULT 0, inv_isa REAL DEFAULT 0, inv_crypto REAL DEFAULT 0, inv_real_estate REAL DEFAULT 0, note TEXT DEFAULT '')",
        "ALTER TABLE monthly_records ADD COLUMN inv_savings REAL DEFAULT 0",
        "ALTER TABLE monthly_records ADD COLUMN inv_overseas REAL DEFAULT 0",
        "ALTER TABLE monthly_records ADD COLUMN inv_isa REAL DEFAULT 0",
        "ALTER TABLE monthly_records ADD COLUMN inv_crypto REAL DEFAULT 0",
        "ALTER TABLE monthly_records ADD COLUMN inv_real_estate REAL DEFAULT 0",
        "CREATE TABLE IF NOT EXISTS shinhan_isa_history (id TEXT PRIMARY KEY, date TEXT NOT NULL, value REAL DEFAULT 0, note TEXT DEFAULT '')",
        "CREATE TABLE IF NOT EXISTS shinhan_isa_holdings (id TEXT PRIMARY KEY, ticker TEXT NOT NULL, name TEXT DEFAULT '', shares REAL DEFAULT 0, price REAL DEFAULT 0, note TEXT DEFAULT '')",
        "CREATE TABLE IF NOT EXISTS dain_isa_history (id TEXT PRIMARY KEY, date TEXT NOT NULL, value REAL DEFAULT 0, note TEXT DEFAULT '')",
        "CREATE TABLE IF NOT EXISTS dain_isa_holdings (id TEXT PRIMARY KEY, ticker TEXT NOT NULL, name TEXT DEFAULT '', shares REAL DEFAULT 0, price REAL DEFAULT 0, note TEXT DEFAULT '')",
        "CREATE TABLE IF NOT EXISTS fixed_savings (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT DEFAULT '적금', amount REAL DEFAULT 0, payment_day INTEGER DEFAULT 1, status TEXT DEFAULT 'active', note TEXT DEFAULT '')",
        "CREATE TABLE IF NOT EXISTS portfolio_templates (id TEXT PRIMARY KEY, name TEXT NOT NULL, note TEXT DEFAULT '')",
        "CREATE TABLE IF NOT EXISTS portfolio_categories (id TEXT PRIMARY KEY, template_id TEXT NOT NULL, name TEXT NOT NULL, color TEXT DEFAULT '#2563eb', order_idx INTEGER DEFAULT 0)",
        "CREATE TABLE IF NOT EXISTS portfolio_allocations (id TEXT PRIMARY KEY, template_id TEXT NOT NULL, category_id TEXT NOT NULL, source_type TEXT NOT NULL, source_id TEXT NOT NULL)",
        "ALTER TABLE portfolio_templates ADD COLUMN rebal_interval_months INTEGER DEFAULT 6",
        "ALTER TABLE portfolio_templates ADD COLUMN deviation_threshold REAL DEFAULT 5.0",
        "ALTER TABLE portfolio_templates ADD COLUMN last_rebal_date TEXT DEFAULT ''",
        "ALTER TABLE portfolio_categories ADD COLUMN target REAL DEFAULT 0",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                pass


# ─── Schemas ────────────────────────────────────────────────────────────────

class SettingsBody(BaseModel):
    fx: float

class FixedCostBody(BaseModel):
    name: str
    category: Optional[str] = "기타"
    amount: Optional[float] = 0
    billing_day: Optional[int] = 1
    payment_method: Optional[str] = "자동이체"
    status: Optional[str] = "active"
    note: Optional[str] = ""

class FixedSavingBody(BaseModel):
    name: str
    category: Optional[str] = "적금"
    amount: Optional[float] = 0
    payment_day: Optional[int] = 1
    status: Optional[str] = "active"
    note: Optional[str] = ""

class PortfolioTemplateBody(BaseModel):
    name: str
    note: Optional[str] = ""
    rebal_interval_months: Optional[int] = 6
    deviation_threshold: Optional[float] = 5.0
    last_rebal_date: Optional[str] = ""

class PortfolioCategoryBody(BaseModel):
    name: str
    color: Optional[str] = "#2563eb"
    order_idx: Optional[int] = 0
    target: Optional[float] = 0

class RebalCompleteBody(BaseModel):
    date: str

class AllocationItem(BaseModel):
    category_id: str
    source_type: str
    source_id: str

class SaveAllocationsBody(BaseModel):
    allocations: list[AllocationItem]

class SavingBody(BaseModel):
    bank: Optional[str] = ""
    name: str
    principal: Optional[float] = 0
    balance: Optional[float] = 0
    monthly_payment: Optional[float] = 0
    payment_day: Optional[int] = 1
    last_paid_month: Optional[str] = ""
    rate: Optional[float] = 0
    start_date: Optional[str] = ""
    maturity_date: Optional[str] = ""
    status: Optional[str] = "active"
    note: Optional[str] = ""

class OverseasHoldingBody(BaseModel):
    owner: Optional[str] = "me"
    ticker: str
    name: Optional[str] = ""
    shares: Optional[float] = 0
    price: Optional[float] = 0
    target: Optional[float] = 0
    note: Optional[str] = ""

class RebalBody(BaseModel):
    date: str
    note: Optional[str] = ""

class ISABody(BaseModel):
    date: str
    value: float
    note: Optional[str] = ""

class ISAHoldingBody(BaseModel):
    ticker: str
    name: Optional[str] = ""
    shares: Optional[float] = 0
    price: Optional[float] = 0
    note: Optional[str] = ""

class RealEstateBody(BaseModel):
    name: str
    type: Optional[str] = "매매"
    deposit: Optional[float] = 0
    monthly_rent: Optional[float] = 0
    purchase_price: Optional[float] = 0
    current_value: Optional[float] = 0
    debt: Optional[float] = 0
    start_date: Optional[str] = ""
    end_date: Optional[str] = ""
    status: Optional[str] = "active"
    note: Optional[str] = ""

class YearlyBody(BaseModel):
    year: int
    savings: Optional[float] = 0
    overseas: Optional[float] = 0
    isa: Optional[float] = 0
    crypto: Optional[float] = 0
    real_estate: Optional[float] = 0
    other: Optional[float] = 0
    inv_savings: Optional[float] = 0
    inv_overseas: Optional[float] = 0
    inv_isa: Optional[float] = 0
    inv_crypto: Optional[float] = 0
    inv_real_estate: Optional[float] = 0
    note: Optional[str] = ""

class MonthlyBody(BaseModel):
    year_month: str
    savings: Optional[float] = 0
    overseas: Optional[float] = 0
    isa: Optional[float] = 0
    crypto: Optional[float] = 0
    real_estate: Optional[float] = 0
    other: Optional[float] = 0
    inv_savings: Optional[float] = 0
    inv_overseas: Optional[float] = 0
    inv_isa: Optional[float] = 0
    inv_crypto: Optional[float] = 0
    inv_real_estate: Optional[float] = 0
    note: Optional[str] = ""


# ─── Settings ───────────────────────────────────────────────────────────────

@app.get("/api/settings")
def get_settings(db: Session = Depends(get_db)):
    fx_row     = db.query(models.Setting).filter_by(key="fx").first()
    income_row = db.query(models.Setting).filter_by(key="monthly_income").first()
    return {
        "fx": float(fx_row.value) if fx_row else 1350.0,
        "monthly_income": float(income_row.value) if income_row else 0.0,
    }


@app.put("/api/settings")
def update_settings(body: SettingsBody, db: Session = Depends(get_db)):
    row = db.query(models.Setting).filter_by(key="fx").first()
    if row:
        row.value = str(body.fx)
    else:
        db.add(models.Setting(key="fx", value=str(body.fx)))
    db.commit()
    return {"fx": body.fx}


class MonthlyIncomeBody(BaseModel):
    monthly_income: float

@app.put("/api/settings/monthly-income")
def update_monthly_income(body: MonthlyIncomeBody, db: Session = Depends(get_db)):
    row = db.query(models.Setting).filter_by(key="monthly_income").first()
    if row:
        row.value = str(body.monthly_income)
    else:
        db.add(models.Setting(key="monthly_income", value=str(body.monthly_income)))
    db.commit()
    return {"monthly_income": body.monthly_income}


# ─── FX Rate ────────────────────────────────────────────────────────────────

@app.get("/api/fx-rate")
async def get_fx_rate():
    """ExchangeRate-API (무료, 키 불필요) 에서 USD/KRW 환율을 가져옵니다."""
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get("https://api.exchangerate-api.com/v4/latest/USD")
            resp.raise_for_status()
            data = resp.json()
            krw = data["rates"]["KRW"]
            return {"krw": round(krw, 2), "date": data["date"], "source": "ExchangeRate-API"}
    except httpx.TimeoutException:
        raise HTTPException(504, "환율 API 응답 시간 초과")
    except Exception:
        raise HTTPException(502, "환율 조회 실패 — 인터넷 연결을 확인하세요")


# ─── Stock Price ────────────────────────────────────────────────────────────

def normalize_yahoo_ticker(ticker: str):
    value = ticker.strip().upper()
    if value.isdigit() and len(value) == 6:
        return f"{value}.KS"
    return value

@app.get("/api/stock-price/{ticker}")
def get_stock_price(ticker: str):
    """단일 티커의 현재가와 종목명을 가져옵니다."""
    yahoo_ticker = normalize_yahoo_ticker(ticker)
    try:
        t = yf.Ticker(yahoo_ticker)
        fi = t.fast_info
        price = fi.last_price
        if price is None:
            raise ValueError("가격 없음")
        # 종목명은 fast_info에 없으므로 info에서 가져옴 (느릴 수 있음)
        info = t.info
        name = info.get("shortName") or info.get("longName") or ""
        return {
            "ticker": yahoo_ticker,
            "price": round(float(price), 4),
            "name": name,
            "currency": fi.currency or "KRW",
        }
    except Exception:
        raise HTTPException(404, f"{yahoo_ticker} 가격 조회 실패 — 올바른 티커인지 확인하세요")


class TickersBody(BaseModel):
    tickers: list[str]

@app.post("/api/stock-prices")
def get_stock_prices(body: TickersBody):
    """여러 티커의 현재가를 한 번에 가져옵니다."""
    results = {}

    def fetch_one(ticker: str):
        yahoo_ticker = normalize_yahoo_ticker(ticker)
        try:
            fi = yf.Ticker(yahoo_ticker).fast_info
            price = fi.last_price
            results[yahoo_ticker] = round(float(price), 4) if price is not None else None
        except Exception:
            results[yahoo_ticker] = None

    with ThreadPoolExecutor(max_workers=8) as pool:
        pool.map(fetch_one, body.tickers)

    return results


# ─── Savings ────────────────────────────────────────────────────────────────

def apply_monthly_saving_deposits(db: Session):
    today = date.today()
    current_month = today.strftime("%Y-%m")
    changed = False
    rows = db.query(models.Saving).filter_by(status="active").all()

    for rec in rows:
        monthly = float(rec.monthly_payment or 0)
        if monthly <= 0:
            continue

        payment_day = int(rec.payment_day or 1)
        payment_day = max(1, min(payment_day, 31))
        if today.day < payment_day:
            continue
        if rec.last_paid_month == current_month:
            continue
        if rec.start_date and rec.start_date[:7] > current_month:
            continue
        if rec.maturity_date and rec.maturity_date[:7] < current_month:
            continue

        rec.principal = float(rec.principal or 0) + monthly
        rec.balance = float(rec.balance or 0) + monthly
        rec.last_paid_month = current_month
        changed = True

    if changed:
        db.commit()

def normalize_saving_data(data: dict):
    payment_day = int(data.get("payment_day") or 1)
    data["payment_day"] = max(1, min(payment_day, 31))
    if float(data.get("monthly_payment") or 0) > 0 and not data.get("last_paid_month"):
        today = date.today()
        if today.day >= data["payment_day"]:
            data["last_paid_month"] = today.strftime("%Y-%m")
    return data

@app.get("/api/savings")
def list_savings(db: Session = Depends(get_db)):
    apply_monthly_saving_deposits(db)
    return db.query(models.Saving).all()

@app.post("/api/savings", status_code=201)
def create_saving(body: SavingBody, db: Session = Depends(get_db)):
    rec = models.Saving(id=new_id(), **normalize_saving_data(body.model_dump()))
    db.add(rec); db.commit(); db.refresh(rec)
    return rec

@app.put("/api/savings/{id}")
def update_saving(id: str, body: SavingBody, db: Session = Depends(get_db)):
    rec = db.query(models.Saving).filter_by(id=id).first()
    if not rec: raise HTTPException(404)
    for k, v in normalize_saving_data(body.model_dump()).items(): setattr(rec, k, v)
    db.commit(); db.refresh(rec)
    return rec

@app.delete("/api/savings/{id}", status_code=204)
def delete_saving(id: str, db: Session = Depends(get_db)):
    rec = db.query(models.Saving).filter_by(id=id).first()
    if not rec: raise HTTPException(404)
    db.delete(rec); db.commit()


# ─── Overseas ───────────────────────────────────────────────────────────────

@app.get("/api/overseas/holdings")
def list_holdings(db: Session = Depends(get_db)):
    return db.query(models.OverseasHolding).all()

@app.post("/api/overseas/holdings", status_code=201)
def create_holding(body: OverseasHoldingBody, db: Session = Depends(get_db)):
    rec = models.OverseasHolding(id=new_id(), **body.model_dump())
    db.add(rec); db.commit(); db.refresh(rec)
    return rec

@app.put("/api/overseas/holdings/{id}")
def update_holding(id: str, body: OverseasHoldingBody, db: Session = Depends(get_db)):
    rec = db.query(models.OverseasHolding).filter_by(id=id).first()
    if not rec: raise HTTPException(404)
    for k, v in body.model_dump().items(): setattr(rec, k, v)
    db.commit(); db.refresh(rec)
    return rec

@app.delete("/api/overseas/holdings/{id}", status_code=204)
def delete_holding(id: str, db: Session = Depends(get_db)):
    rec = db.query(models.OverseasHolding).filter_by(id=id).first()
    if not rec: raise HTTPException(404)
    db.delete(rec); db.commit()

@app.get("/api/overseas/rebalancing")
def list_rebal(db: Session = Depends(get_db)):
    return db.query(models.RebalRecord).order_by(models.RebalRecord.date.desc()).all()

@app.post("/api/overseas/rebalancing", status_code=201)
def create_rebal(body: RebalBody, db: Session = Depends(get_db)):
    rec = models.RebalRecord(id=new_id(), **body.model_dump())
    db.add(rec); db.commit(); db.refresh(rec)
    return rec

@app.delete("/api/overseas/rebalancing/{id}", status_code=204)
def delete_rebal(id: str, db: Session = Depends(get_db)):
    rec = db.query(models.RebalRecord).filter_by(id=id).first()
    if not rec: raise HTTPException(404)
    db.delete(rec); db.commit()


# ─── ISA ────────────────────────────────────────────────────────────────────

@app.get("/api/isa/holdings")
def list_isa_holdings(db: Session = Depends(get_db)):
    return db.query(models.ISAHolding).all()

@app.post("/api/isa/holdings", status_code=201)
def create_isa_holding(body: ISAHoldingBody, db: Session = Depends(get_db)):
    data = body.model_dump()
    data["ticker"] = normalize_yahoo_ticker(data["ticker"])
    rec = models.ISAHolding(id=new_id(), **data)
    db.add(rec); db.commit(); db.refresh(rec)
    return rec

@app.put("/api/isa/holdings/{id}")
def update_isa_holding(id: str, body: ISAHoldingBody, db: Session = Depends(get_db)):
    rec = db.query(models.ISAHolding).filter_by(id=id).first()
    if not rec: raise HTTPException(404)
    data = body.model_dump()
    data["ticker"] = normalize_yahoo_ticker(data["ticker"])
    for k, v in data.items(): setattr(rec, k, v)
    db.commit(); db.refresh(rec)
    return rec

@app.delete("/api/isa/holdings/{id}", status_code=204)
def delete_isa_holding(id: str, db: Session = Depends(get_db)):
    rec = db.query(models.ISAHolding).filter_by(id=id).first()
    if not rec: raise HTTPException(404)
    db.delete(rec); db.commit()

@app.post("/api/isa/sync-kiwoom")
async def sync_isa_from_kiwoom(db: Session = Depends(get_db)):
    try:
        data = await KiwoomClient().account_balance()
    except KiwoomConfigError as e:
        raise HTTPException(400, str(e))
    except KiwoomAPIError as e:
        raise HTTPException(502, str(e))
    except Exception as e:
        raise HTTPException(502, f"Kiwoom ISA sync failed: {e}")

    positions = data["positions"]
    existing = {h.ticker: h for h in db.query(models.ISAHolding).all()}
    for pos in positions:
        payload = {
            "ticker": pos["ticker"],
            "name": pos["name"],
            "shares": pos["shares"],
            "price": pos["price"],
            "note": "Kiwoom REST API",
        }
        rec = existing.get(pos["ticker"])
        if rec:
            for k, v in payload.items():
                setattr(rec, k, v)
        else:
            db.add(models.ISAHolding(id=new_id(), **payload))

    from datetime import date
    sync_date = date.today().isoformat()
    total = round(float(data["total"] or 0))
    note = f"Kiwoom REST API sync ({len(positions)} holdings)"
    kiwoom_records = (
        db.query(models.ISARecord)
        .filter(models.ISARecord.date == sync_date, models.ISARecord.note.like("Kiwoom REST API sync%"))
        .all()
    )
    if kiwoom_records:
        balance = kiwoom_records[0]
        balance.value = total
        balance.note = note
        for duplicate in kiwoom_records[1:]:
            db.delete(duplicate)
    else:
        balance = models.ISARecord(id=new_id(), date=sync_date, value=total, note=note)
        db.add(balance)
    db.commit()

    return {
        "date": balance.date,
        "value": total,
        "holdings": positions,
        "count": len(positions),
        "meta": data["meta"],
    }

@app.get("/api/isa")
def list_isa(db: Session = Depends(get_db)):
    return db.query(models.ISARecord).order_by(models.ISARecord.date).all()

@app.post("/api/isa", status_code=201)
def create_isa(body: ISABody, db: Session = Depends(get_db)):
    rec = models.ISARecord(id=new_id(), **body.model_dump())
    db.add(rec); db.commit(); db.refresh(rec)
    return rec

@app.delete("/api/isa/{id}", status_code=204)
def delete_isa(id: str, db: Session = Depends(get_db)):
    rec = db.query(models.ISARecord).filter_by(id=id).first()
    if not rec: raise HTTPException(404)
    db.delete(rec); db.commit()


@app.get("/api/shinhan-isa/holdings")
def list_shinhan_isa_holdings(db: Session = Depends(get_db)):
    return db.query(models.ShinhanISAHolding).all()


@app.post("/api/shinhan-isa/holdings", status_code=201)
def create_shinhan_isa_holding(body: ISAHoldingBody, db: Session = Depends(get_db)):
    data = body.model_dump()
    data["ticker"] = normalize_yahoo_ticker(data["ticker"])
    rec = models.ShinhanISAHolding(id=new_id(), **data)
    db.add(rec); db.commit(); db.refresh(rec)
    return rec


@app.put("/api/shinhan-isa/holdings/{id}")
def update_shinhan_isa_holding(id: str, body: ISAHoldingBody, db: Session = Depends(get_db)):
    rec = db.query(models.ShinhanISAHolding).filter_by(id=id).first()
    if not rec: raise HTTPException(404)
    data = body.model_dump()
    data["ticker"] = normalize_yahoo_ticker(data["ticker"])
    for k, v in data.items(): setattr(rec, k, v)
    db.commit(); db.refresh(rec)
    return rec


@app.delete("/api/shinhan-isa/holdings/{id}", status_code=204)
def delete_shinhan_isa_holding(id: str, db: Session = Depends(get_db)):
    rec = db.query(models.ShinhanISAHolding).filter_by(id=id).first()
    if not rec: raise HTTPException(404)
    db.delete(rec); db.commit()


@app.post("/api/shinhan-isa/sync")
async def sync_shinhan_isa(db: Session = Depends(get_db)):
    try:
        data = await ShinhanClient().account_balance()
    except ShinhanConfigError as e:
        raise HTTPException(400, str(e))
    except ShinhanAPIError as e:
        raise HTTPException(502, str(e))
    except Exception as e:
        raise HTTPException(502, f"Shinhan ISA sync failed: {e}")

    positions = data["positions"]
    existing = {h.ticker: h for h in db.query(models.ShinhanISAHolding).all()}
    for pos in positions:
        payload = {
            "ticker": pos["ticker"],
            "name": pos["name"],
            "shares": pos["shares"],
            "price": pos["price"],
            "note": "Shinhan ISA API",
        }
        rec = existing.get(pos["ticker"])
        if rec:
            for k, v in payload.items():
                setattr(rec, k, v)
        else:
            db.add(models.ShinhanISAHolding(id=new_id(), **payload))

    sync_date = date.today().isoformat()
    total = round(float(data["total"] or 0))
    note = f"Shinhan ISA sync ({len(positions)} holdings)"
    sync_records = (
        db.query(models.ShinhanISARecord)
        .filter(models.ShinhanISARecord.date == sync_date, models.ShinhanISARecord.note.like("Shinhan ISA sync%"))
        .all()
    )
    if sync_records:
        balance = sync_records[0]
        balance.value = total
        balance.note = note
        for duplicate in sync_records[1:]:
            db.delete(duplicate)
    else:
        balance = models.ShinhanISARecord(id=new_id(), date=sync_date, value=total, note=note)
        db.add(balance)
    db.commit()

    return {
        "date": balance.date,
        "value": total,
        "holdings": positions,
        "count": len(positions),
        "meta": data["meta"],
    }


@app.get("/api/shinhan-isa")
def list_shinhan_isa(db: Session = Depends(get_db)):
    return db.query(models.ShinhanISARecord).order_by(models.ShinhanISARecord.date).all()


@app.post("/api/shinhan-isa", status_code=201)
def create_shinhan_isa(body: ISABody, db: Session = Depends(get_db)):
    rec = models.ShinhanISARecord(id=new_id(), **body.model_dump())
    db.add(rec); db.commit(); db.refresh(rec)
    return rec


@app.delete("/api/shinhan-isa/{id}", status_code=204)
def delete_shinhan_isa(id: str, db: Session = Depends(get_db)):
    rec = db.query(models.ShinhanISARecord).filter_by(id=id).first()
    if not rec: raise HTTPException(404)
    db.delete(rec); db.commit()


# ─── Dain ISA (김다인 키움) ───────────────────────────────────────────────────

@app.get("/api/dain-isa/holdings")
def list_dain_isa_holdings(db: Session = Depends(get_db)):
    return db.query(models.DainISAHolding).all()


@app.post("/api/dain-isa/holdings", status_code=201)
def create_dain_isa_holding(body: ISAHoldingBody, db: Session = Depends(get_db)):
    data = body.model_dump()
    data["ticker"] = normalize_yahoo_ticker(data["ticker"])
    rec = models.DainISAHolding(id=new_id(), **data)
    db.add(rec); db.commit(); db.refresh(rec)
    return rec


@app.put("/api/dain-isa/holdings/{id}")
def update_dain_isa_holding(id: str, body: ISAHoldingBody, db: Session = Depends(get_db)):
    rec = db.query(models.DainISAHolding).filter_by(id=id).first()
    if not rec: raise HTTPException(404)
    data = body.model_dump()
    data["ticker"] = normalize_yahoo_ticker(data["ticker"])
    for k, v in data.items(): setattr(rec, k, v)
    db.commit(); db.refresh(rec)
    return rec


@app.delete("/api/dain-isa/holdings/{id}", status_code=204)
def delete_dain_isa_holding(id: str, db: Session = Depends(get_db)):
    rec = db.query(models.DainISAHolding).filter_by(id=id).first()
    if not rec: raise HTTPException(404)
    db.delete(rec); db.commit()


@app.post("/api/dain-isa/sync-kiwoom")
async def sync_dain_isa_from_kiwoom(db: Session = Depends(get_db)):
    try:
        data = await KiwoomClient(prefix="KIWOOM2").account_balance()
    except KiwoomConfigError as e:
        raise HTTPException(400, str(e))
    except KiwoomAPIError as e:
        raise HTTPException(502, str(e))
    except Exception as e:
        raise HTTPException(502, f"Kiwoom ISA (김다인) sync failed: {e}")

    positions = data["positions"]
    existing = {h.ticker: h for h in db.query(models.DainISAHolding).all()}
    for pos in positions:
        payload = {
            "ticker": pos["ticker"],
            "name":   pos["name"],
            "shares": pos["shares"],
            "price":  pos["price"],
            "note":   "Kiwoom REST API (김다인)",
        }
        rec = existing.get(pos["ticker"])
        if rec:
            for k, v in payload.items():
                setattr(rec, k, v)
        else:
            db.add(models.DainISAHolding(id=new_id(), **payload))

    sync_date = date.today().isoformat()
    total = round(float(data["total"] or 0))
    note = f"Kiwoom REST API sync 김다인 ({len(positions)} holdings)"
    sync_records = (
        db.query(models.DainISARecord)
        .filter(models.DainISARecord.date == sync_date, models.DainISARecord.note.like("Kiwoom REST API sync 김다인%"))
        .all()
    )
    if sync_records:
        balance = sync_records[0]
        balance.value = total
        balance.note = note
        for dup in sync_records[1:]:
            db.delete(dup)
    else:
        balance = models.DainISARecord(id=new_id(), date=sync_date, value=total, note=note)
        db.add(balance)
    db.commit()

    return {
        "date":     balance.date,
        "value":    total,
        "holdings": positions,
        "count":    len(positions),
        "meta":     data.get("meta", {}),
    }


@app.get("/api/dain-isa")
def list_dain_isa(db: Session = Depends(get_db)):
    return db.query(models.DainISARecord).order_by(models.DainISARecord.date).all()


@app.post("/api/dain-isa", status_code=201)
def create_dain_isa(body: ISABody, db: Session = Depends(get_db)):
    rec = models.DainISARecord(id=new_id(), **body.model_dump())
    db.add(rec); db.commit(); db.refresh(rec)
    return rec


@app.delete("/api/dain-isa/{id}", status_code=204)
def delete_dain_isa(id: str, db: Session = Depends(get_db)):
    rec = db.query(models.DainISARecord).filter_by(id=id).first()
    if not rec: raise HTTPException(404)
    db.delete(rec); db.commit()


# ─── Crypto ─────────────────────────────────────────────────────────────────

@app.get("/api/crypto/holdings")
def list_crypto_holdings(db: Session = Depends(get_db)):
    return db.query(models.CryptoHolding).order_by(models.CryptoHolding.value.desc()).all()

@app.get("/api/crypto/history")
def list_crypto_history(db: Session = Depends(get_db)):
    return db.query(models.CryptoRecord).order_by(models.CryptoRecord.date).all()

@app.post("/api/crypto/sync-upbit")
async def sync_crypto_from_upbit(db: Session = Depends(get_db)):
    try:
        data = await UpbitClient().portfolio()
    except UpbitConfigError as e:
        raise HTTPException(400, str(e))
    except UpbitAPIError as e:
        raise HTTPException(502, str(e))
    except Exception as e:
        raise HTTPException(502, f"Upbit sync failed: {e}")

    existing = {h.market: h for h in db.query(models.CryptoHolding).all()}
    seen = set()
    for pos in data["positions"]:
        seen.add(pos["market"])
        payload = {
            "market": pos["market"],
            "currency": pos["currency"],
            "balance": pos["balance"],
            "locked": pos["locked"],
            "avg_buy_price": pos["avg_buy_price"],
            "price": pos["price"],
            "value": pos["value"],
            "profit": pos["profit"],
            "note": "Upbit Open API",
        }
        rec = existing.get(pos["market"])
        if rec:
            for k, v in payload.items():
                setattr(rec, k, v)
        else:
            db.add(models.CryptoHolding(id=new_id(), **payload))

    for market, rec in existing.items():
        if market not in seen:
            db.delete(rec)

    sync_date = date.today().isoformat()
    total = round(float(data["total"] or 0))
    note = f"Upbit sync ({len(data['positions'])} holdings)"
    upbit_records = (
        db.query(models.CryptoRecord)
        .filter(models.CryptoRecord.date == sync_date, models.CryptoRecord.note.like("Upbit sync%"))
        .all()
    )
    if upbit_records:
        record = upbit_records[0]
        record.value = total
        record.krw_cash = float(data["krw_cash"] or 0)
        record.note = note
        for duplicate in upbit_records[1:]:
            db.delete(duplicate)
    else:
        record = models.CryptoRecord(
            id=new_id(),
            date=sync_date,
            value=total,
            krw_cash=float(data["krw_cash"] or 0),
            note=note,
        )
        db.add(record)
    db.commit()

    return {
        "date": record.date,
        "value": total,
        "krw_cash": record.krw_cash,
        "holdings": data["positions"],
        "count": len(data["positions"]),
    }


# ─── Real Estate ─────────────────────────────────────────────────────────────

@app.get("/api/real-estate")
def list_real_estate(db: Session = Depends(get_db)):
    return db.query(models.RealEstate).all()

@app.post("/api/real-estate", status_code=201)
def create_real_estate(body: RealEstateBody, db: Session = Depends(get_db)):
    rec = models.RealEstate(id=new_id(), **body.model_dump())
    db.add(rec); db.commit(); db.refresh(rec)
    return rec

@app.put("/api/real-estate/{id}")
def update_real_estate(id: str, body: RealEstateBody, db: Session = Depends(get_db)):
    rec = db.query(models.RealEstate).filter_by(id=id).first()
    if not rec: raise HTTPException(404)
    for k, v in body.model_dump().items(): setattr(rec, k, v)
    db.commit(); db.refresh(rec)
    return rec

@app.delete("/api/real-estate/{id}", status_code=204)
def delete_real_estate(id: str, db: Session = Depends(get_db)):
    rec = db.query(models.RealEstate).filter_by(id=id).first()
    if not rec: raise HTTPException(404)
    db.delete(rec); db.commit()


# ─── Yearly Records ──────────────────────────────────────────────────────────

@app.get("/api/yearly")
def list_yearly(db: Session = Depends(get_db)):
    return db.query(models.YearlyRecord).order_by(models.YearlyRecord.year).all()

@app.post("/api/yearly", status_code=201)
def create_yearly(body: YearlyBody, db: Session = Depends(get_db)):
    exists = db.query(models.YearlyRecord).filter_by(year=body.year).first()
    if exists: raise HTTPException(400, f"{body.year}년 기록이 이미 존재합니다")
    data = body.model_dump()
    data["total"] = data["savings"] + data["overseas"] + data["isa"] + data["crypto"] + data["real_estate"] + data["other"]
    rec = models.YearlyRecord(id=new_id(), **data)
    db.add(rec); db.commit(); db.refresh(rec)
    return rec

@app.put("/api/yearly/{id}")
def update_yearly(id: str, body: YearlyBody, db: Session = Depends(get_db)):
    rec = db.query(models.YearlyRecord).filter_by(id=id).first()
    if not rec: raise HTTPException(404)
    data = body.model_dump()
    data["total"] = data["savings"] + data["overseas"] + data["isa"] + data["crypto"] + data["real_estate"] + data["other"]
    for k, v in data.items(): setattr(rec, k, v)
    db.commit(); db.refresh(rec)
    return rec

@app.delete("/api/yearly/{id}", status_code=204)
def delete_yearly(id: str, db: Session = Depends(get_db)):
    rec = db.query(models.YearlyRecord).filter_by(id=id).first()
    if not rec: raise HTTPException(404)
    db.delete(rec); db.commit()


# ─── Monthly Records ─────────────────────────────────────────────────────────

@app.get("/api/monthly")
def list_monthly(db: Session = Depends(get_db)):
    return db.query(models.MonthlyRecord).order_by(models.MonthlyRecord.year_month).all()

@app.post("/api/monthly", status_code=201)
def create_monthly(body: MonthlyBody, db: Session = Depends(get_db)):
    exists = db.query(models.MonthlyRecord).filter_by(year_month=body.year_month).first()
    if exists: raise HTTPException(400, f"{body.year_month} 기록이 이미 존재합니다")
    data = body.model_dump()
    data["total"] = data["savings"] + data["overseas"] + data["isa"] + data["crypto"] + data["real_estate"] + data["other"]
    rec = models.MonthlyRecord(id=new_id(), **data)
    db.add(rec); db.commit(); db.refresh(rec)
    return rec

@app.put("/api/monthly/{id}")
def update_monthly(id: str, body: MonthlyBody, db: Session = Depends(get_db)):
    rec = db.query(models.MonthlyRecord).filter_by(id=id).first()
    if not rec: raise HTTPException(404)
    data = body.model_dump()
    data["total"] = data["savings"] + data["overseas"] + data["isa"] + data["crypto"] + data["real_estate"] + data["other"]
    for k, v in data.items(): setattr(rec, k, v)
    db.commit(); db.refresh(rec)
    return rec

@app.delete("/api/monthly/{id}", status_code=204)
def delete_monthly(id: str, db: Session = Depends(get_db)):
    rec = db.query(models.MonthlyRecord).filter_by(id=id).first()
    if not rec: raise HTTPException(404)
    db.delete(rec); db.commit()


# ─── Migration: Yearly → Monthly ─────────────────────────────────────────────

@app.post("/api/migrate/yearly-to-monthly")
def migrate_yearly_to_monthly(db: Session = Depends(get_db)):
    yearly_list = db.query(models.YearlyRecord).order_by(models.YearlyRecord.year).all()
    created, skipped = [], []

    for yr in yearly_list:
        # 해당 연도 월간기록 중 가장 이른 달 확인
        existing_months = (
            db.query(models.MonthlyRecord)
            .filter(models.MonthlyRecord.year_month.like(f"{yr.year}-%"))
            .order_by(models.MonthlyRecord.year_month)
            .all()
        )
        if existing_months:
            skipped.append({"year": yr.year, "reason": f"{existing_months[0].year_month} 기록이 이미 존재합니다"})
            continue

        year_month = f"{yr.year}-01"
        rec = models.MonthlyRecord(
            id=new_id(),
            year_month=year_month,
            savings=yr.savings or 0,
            overseas=yr.overseas or 0,
            isa=yr.isa or 0,
            crypto=yr.crypto or 0,
            real_estate=yr.real_estate or 0,
            other=yr.other or 0,
            total=yr.total or 0,
            inv_savings=getattr(yr, 'inv_savings', 0) or 0,
            inv_overseas=getattr(yr, 'inv_overseas', 0) or 0,
            inv_isa=getattr(yr, 'inv_isa', 0) or 0,
            inv_crypto=getattr(yr, 'inv_crypto', 0) or 0,
            inv_real_estate=getattr(yr, 'inv_real_estate', 0) or 0,
            note=yr.note or '',
        )
        db.add(rec)
        created.append({"year": yr.year, "year_month": year_month})

    db.commit()
    return {"created": created, "skipped": skipped}


# ─── Fixed Costs ─────────────────────────────────────────────────────────────

@app.get("/api/fixed-costs")
def list_fixed_costs(db: Session = Depends(get_db)):
    return db.query(models.FixedCost).order_by(models.FixedCost.category, models.FixedCost.billing_day).all()

@app.post("/api/fixed-costs", status_code=201)
def create_fixed_cost(body: FixedCostBody, db: Session = Depends(get_db)):
    rec = models.FixedCost(id=new_id(), **body.model_dump())
    db.add(rec); db.commit(); db.refresh(rec)
    return rec

@app.put("/api/fixed-costs/{id}")
def update_fixed_cost(id: str, body: FixedCostBody, db: Session = Depends(get_db)):
    rec = db.query(models.FixedCost).filter_by(id=id).first()
    if not rec: raise HTTPException(404)
    for k, v in body.model_dump().items(): setattr(rec, k, v)
    db.commit(); db.refresh(rec)
    return rec

@app.delete("/api/fixed-costs/{id}", status_code=204)
def delete_fixed_cost(id: str, db: Session = Depends(get_db)):
    rec = db.query(models.FixedCost).filter_by(id=id).first()
    if not rec: raise HTTPException(404)
    db.delete(rec); db.commit()


# ─── Fixed Savings ────────────────────────────────────────────────────────────

@app.get("/api/fixed-savings")
def list_fixed_savings(db: Session = Depends(get_db)):
    return db.query(models.FixedSaving).all()

@app.post("/api/fixed-savings", status_code=201)
def create_fixed_saving(body: FixedSavingBody, db: Session = Depends(get_db)):
    rec = models.FixedSaving(id=new_id(), **body.model_dump())
    db.add(rec); db.commit(); db.refresh(rec)
    return rec

@app.put("/api/fixed-savings/{id}")
def update_fixed_saving(id: str, body: FixedSavingBody, db: Session = Depends(get_db)):
    rec = db.query(models.FixedSaving).filter_by(id=id).first()
    if not rec: raise HTTPException(404)
    for k, v in body.model_dump().items(): setattr(rec, k, v)
    db.commit(); db.refresh(rec)
    return rec

@app.delete("/api/fixed-savings/{id}", status_code=204)
def delete_fixed_saving(id: str, db: Session = Depends(get_db)):
    rec = db.query(models.FixedSaving).filter_by(id=id).first()
    if not rec: raise HTTPException(404)
    db.delete(rec); db.commit()


# ─── Portfolio Templates ──────────────────────────────────────────────────────

@app.get("/api/portfolio-templates")
def list_portfolio_templates(db: Session = Depends(get_db)):
    return db.query(models.PortfolioTemplate).all()

@app.post("/api/portfolio-templates", status_code=201)
def create_portfolio_template(body: PortfolioTemplateBody, db: Session = Depends(get_db)):
    rec = models.PortfolioTemplate(id=new_id(), **body.model_dump())
    db.add(rec); db.commit(); db.refresh(rec)
    return rec

@app.put("/api/portfolio-templates/{id}")
def update_portfolio_template(id: str, body: PortfolioTemplateBody, db: Session = Depends(get_db)):
    rec = db.query(models.PortfolioTemplate).filter_by(id=id).first()
    if not rec: raise HTTPException(404)
    for k, v in body.model_dump().items(): setattr(rec, k, v)
    db.commit(); db.refresh(rec)
    return rec

@app.delete("/api/portfolio-templates/{id}", status_code=204)
def delete_portfolio_template(id: str, db: Session = Depends(get_db)):
    rec = db.query(models.PortfolioTemplate).filter_by(id=id).first()
    if not rec: raise HTTPException(404)
    # cascade: delete categories and allocations
    db.query(models.PortfolioCategory).filter_by(template_id=id).delete()
    db.query(models.PortfolioAllocation).filter_by(template_id=id).delete()
    db.delete(rec); db.commit()


# ─── Portfolio Categories ─────────────────────────────────────────────────────

@app.get("/api/portfolio-templates/{template_id}/categories")
def list_portfolio_categories(template_id: str, db: Session = Depends(get_db)):
    return db.query(models.PortfolioCategory)\
             .filter_by(template_id=template_id)\
             .order_by(models.PortfolioCategory.order_idx)\
             .all()

@app.post("/api/portfolio-templates/{template_id}/categories", status_code=201)
def create_portfolio_category(template_id: str, body: PortfolioCategoryBody, db: Session = Depends(get_db)):
    rec = models.PortfolioCategory(id=new_id(), template_id=template_id, **body.model_dump())
    db.add(rec); db.commit(); db.refresh(rec)
    return rec

@app.put("/api/portfolio-categories/{id}")
def update_portfolio_category(id: str, body: PortfolioCategoryBody, db: Session = Depends(get_db)):
    rec = db.query(models.PortfolioCategory).filter_by(id=id).first()
    if not rec: raise HTTPException(404)
    for k, v in body.model_dump().items(): setattr(rec, k, v)
    db.commit(); db.refresh(rec)
    return rec

@app.delete("/api/portfolio-categories/{id}", status_code=204)
def delete_portfolio_category(id: str, db: Session = Depends(get_db)):
    rec = db.query(models.PortfolioCategory).filter_by(id=id).first()
    if not rec: raise HTTPException(404)
    db.query(models.PortfolioAllocation).filter_by(category_id=id).delete()
    db.delete(rec); db.commit()


# ─── Portfolio Allocations ────────────────────────────────────────────────────

@app.get("/api/portfolio-templates/{template_id}/allocations")
def get_portfolio_allocations(template_id: str, db: Session = Depends(get_db)):
    return db.query(models.PortfolioAllocation).filter_by(template_id=template_id).all()

@app.put("/api/portfolio-templates/{template_id}/allocations")
def save_portfolio_allocations(template_id: str, body: SaveAllocationsBody, db: Session = Depends(get_db)):
    # replace all allocations for this template
    db.query(models.PortfolioAllocation).filter_by(template_id=template_id).delete()
    for item in body.allocations:
        rec = models.PortfolioAllocation(
            id=new_id(),
            template_id=template_id,
            category_id=item.category_id,
            source_type=item.source_type,
            source_id=item.source_id,
        )
        db.add(rec)
    db.commit()
    return {"saved": len(body.allocations)}


# ─── Portfolio Rebalancing ────────────────────────────────────────────────────

@app.post("/api/portfolio-templates/{template_id}/rebalance")
def record_rebalance(template_id: str, body: RebalCompleteBody, db: Session = Depends(get_db)):
    rec = db.query(models.PortfolioTemplate).filter_by(id=template_id).first()
    if not rec: raise HTTPException(404)
    rec.last_rebal_date = body.date
    db.commit(); db.refresh(rec)
    return rec


# ─── Ticker info (inception date) ────────────────────────────────────────────

@app.post("/api/ticker-info")
async def get_ticker_info(payload: dict):
    """Returns the earliest available date for each ticker."""
    tickers = [
        t for t in payload.get("tickers", [])
        if t and t.strip().upper() not in ("", "CASH", "현금")
    ]
    if not tickers:
        return {}

    loop = asyncio.get_running_loop()

    async def _fetch_one(ticker: str):
        def _inner():
            try:
                hist = yf.Ticker(ticker).history(period="max", auto_adjust=True)
                if hist.empty:
                    return None
                return hist.index[0].strftime("%Y-%m-%d")
            except Exception:
                return None
        return ticker, await loop.run_in_executor(None, _inner)

    results = await asyncio.gather(*[_fetch_one(t) for t in tickers])
    return {ticker: date for ticker, date in results if date}


# ─── Backtest ─────────────────────────────────────────────────────────────────

@app.post("/api/backtest")
async def run_backtest(payload: dict):
    """
    payload: {
      categories: [{name, target, ticker, color}],
      start_date: "2015-01-01",
      end_date: "2024-12-31",
      initial_investment: 10000000,
      rebal_frequency: "monthly"|"quarterly"|"annual"|"none"
    }
    """
    import pandas as pd  # noqa: PLC0415 — lazy import to keep startup fast

    categories  = payload.get("categories", [])
    start_date  = payload.get("start_date",  "2015-01-01")
    end_date    = payload.get("end_date",    date.today().isoformat())
    initial     = float(payload.get("initial_investment", 10_000_000))
    rebal_freq  = payload.get("rebal_frequency", "quarterly")

    if not categories:
        raise HTTPException(400, "카테고리가 없습니다")

    total_target = sum(c.get("target", 0) for c in categories)
    if total_target <= 0:
        raise HTTPException(400, "목표비중 합이 0입니다")

    def _is_cash(c):
        return (c.get("ticker") or "").strip().upper() in ("", "CASH", "현금")

    ticker_cats = [c for c in categories if not _is_cash(c)]
    cash_weight = sum(c.get("target", 0) for c in categories if _is_cash(c)) / total_target
    weights     = {c["ticker"].strip(): c["target"] / total_target for c in ticker_cats}
    tickers     = list(weights.keys())

    # ── fetch total-return price data (배당 재투자 반영) ─────────────────────
    # yf.Ticker().history(auto_adjust=True) 는 배당락 전 가격을 소급 조정하므로
    # 수익률을 계산하면 '배당 재투자 총수익률(Total Return)'이 자동으로 반영됩니다.
    if tickers:
        loop = asyncio.get_running_loop()

        async def _fetch_one(t: str):
            def _inner():
                hist = yf.Ticker(t).history(
                    start=start_date, end=end_date,
                    auto_adjust=True,   # 배당+분할 소급 조정 → total return
                    actions=False,
                )
                if hist.empty:
                    return None
                return pd.Series(hist["Close"].values, index=hist.index, name=t)
            return t, await loop.run_in_executor(None, _inner)

        try:
            fetched = await asyncio.gather(*[_fetch_one(t) for t in tickers])
        except Exception as e:
            raise HTTPException(502, f"Yahoo Finance 오류: {e}")

        series_map = {t: s for t, s in fetched if s is not None}
        if not series_map:
            raise HTTPException(502, f"데이터 없음: {', '.join(tickers)}")

        price_df = pd.DataFrame(series_map)
        monthly  = price_df.resample("ME").last().ffill()
        ret_df   = monthly.pct_change().dropna(how="all")
        dates    = list(ret_df.index)
    else:
        ret_df = None
        dates  = []

    # ── simulation ────────────────────────────────────────────────────────────
    rebal_map = {"monthly": 1, "quarterly": 3, "annual": 12, "none": 99999}
    rebal_n   = rebal_map.get(rebal_freq, 3)

    port     = {t: initial * weights[t] for t in tickers}
    cash_val = initial * cash_weight
    peak     = initial

    if not dates:
        series = [{"date": start_date[:7], "value": round(initial), "drawdown": 0.0}]
    else:
        series = [{"date": dates[0].strftime("%Y-%m"), "value": round(initial), "drawdown": 0.0}]

        for i, dt in enumerate(dates):
            for t in tickers:
                if ret_df is not None and t in ret_df.columns:
                    r = ret_df.at[dt, t]
                    if pd.notna(r):
                        port[t] = port.get(t, 0.0) * (1 + float(r))

            total = sum(port.values()) + cash_val
            peak  = max(peak, total)
            dd    = (total - peak) / peak * 100

            series.append({
                "date":     dt.strftime("%Y-%m"),
                "value":    round(total),
                "drawdown": round(dd, 2),
            })

            if (i + 1) % rebal_n == 0:
                for t in tickers:
                    port[t] = total * weights[t]
                cash_val = total * cash_weight

    # ── statistics ───────────────────────────────────────────────────────────
    s0, se = series[0]["value"], series[-1]["value"]
    n_m    = len(series) - 1
    n_y    = n_m / 12 if n_m > 0 else 1

    cagr         = ((se / s0) ** (1 / n_y) - 1) * 100 if s0 > 0 else 0
    total_return = (se - s0) / s0 * 100 if s0 > 0 else 0
    max_dd       = min(s["drawdown"] for s in series)

    vals   = [s["value"] for s in series]
    m_rets = [(vals[i] - vals[i-1]) / vals[i-1]
              for i in range(1, len(vals)) if vals[i-1] > 0]
    if m_rets:
        mu  = sum(m_rets) / len(m_rets)
        var = sum((r - mu) ** 2 for r in m_rets) / len(m_rets)
        vol = (var ** 0.5) * (12 ** 0.5) * 100
    else:
        vol = 0.0
    sharpe = cagr / vol if vol > 0 else 0.0

    return {
        "series": series,
        "stats": {
            "cagr":         round(cagr,         2),
            "total_return": round(total_return,  2),
            "max_drawdown": round(max_dd,        2),
            "sharpe":       round(sharpe,        2),
            "volatility":   round(vol,           2),
            "start_value":  s0,
            "end_value":    se,
            "months":       n_m,
        },
    }
