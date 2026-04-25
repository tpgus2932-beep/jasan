from sqlalchemy import Column, String, Float, Integer, Text
from database import Base
import uuid


def new_id():
    return str(uuid.uuid4())[:8]


class Setting(Base):
    __tablename__ = "settings"
    key = Column(String, primary_key=True)
    value = Column(String, nullable=False)


class Saving(Base):
    __tablename__ = "savings"
    id = Column(String, primary_key=True, default=new_id)
    bank = Column(String, default="")
    name = Column(String, default="")
    principal = Column(Float, default=0)
    balance = Column(Float, default=0)
    monthly_payment = Column(Float, default=0)
    payment_day = Column(Integer, default=1)
    last_paid_month = Column(String, default="")
    rate = Column(Float, default=0)
    start_date = Column(String, default="")
    maturity_date = Column(String, default="")
    status = Column(String, default="active")
    note = Column(Text, default="")


class OverseasHolding(Base):
    __tablename__ = "overseas_holdings"
    id = Column(String, primary_key=True, default=new_id)
    owner = Column(String, default="me")
    ticker = Column(String, nullable=False)
    name = Column(String, default="")
    shares = Column(Float, default=0)
    price = Column(Float, default=0)
    target = Column(Float, default=0)
    note = Column(Text, default="")


class RebalRecord(Base):
    __tablename__ = "rebal_history"
    id = Column(String, primary_key=True, default=new_id)
    date = Column(String, nullable=False)
    note = Column(Text, default="")


class ISARecord(Base):
    __tablename__ = "isa_history"
    id = Column(String, primary_key=True, default=new_id)
    date = Column(String, nullable=False)
    value = Column(Float, default=0)
    note = Column(Text, default="")


class ISAHolding(Base):
    __tablename__ = "isa_holdings"
    id = Column(String, primary_key=True, default=new_id)
    ticker = Column(String, nullable=False)
    name = Column(String, default="")
    shares = Column(Float, default=0)
    price = Column(Float, default=0)
    note = Column(Text, default="")


class CryptoHolding(Base):
    __tablename__ = "crypto_holdings"
    id = Column(String, primary_key=True, default=new_id)
    market = Column(String, nullable=False)
    currency = Column(String, default="")
    balance = Column(Float, default=0)
    locked = Column(Float, default=0)
    avg_buy_price = Column(Float, default=0)
    price = Column(Float, default=0)
    value = Column(Float, default=0)
    profit = Column(Float, default=0)
    note = Column(Text, default="")


class CryptoRecord(Base):
    __tablename__ = "crypto_history"
    id = Column(String, primary_key=True, default=new_id)
    date = Column(String, nullable=False)
    value = Column(Float, default=0)
    krw_cash = Column(Float, default=0)
    note = Column(Text, default="")


class RealEstate(Base):
    __tablename__ = "real_estate"
    id = Column(String, primary_key=True, default=new_id)
    name = Column(String, nullable=False)           # 이름/주소
    type = Column(String, default="매매")            # 매매 | 전세 | 월세 | 보증금
    # 금액
    deposit = Column(Float, default=0)              # 보증금/전세금
    monthly_rent = Column(Float, default=0)         # 월세
    purchase_price = Column(Float, default=0)       # 매매가 (취득가)
    current_value = Column(Float, default=0)        # 현재 시세
    debt = Column(Float, default=0)                 # 부채 (담보대출 등)
    # 날짜
    start_date = Column(String, default="")
    end_date = Column(String, default="")
    # 메타
    status = Column(String, default="active")       # active | ended
    note = Column(Text, default="")


class YearlyRecord(Base):
    __tablename__ = "yearly_records"
    id = Column(String, primary_key=True, default=new_id)
    year = Column(Integer, nullable=False, unique=True)
    savings = Column(Float, default=0)
    overseas = Column(Float, default=0)
    isa = Column(Float, default=0)
    crypto = Column(Float, default=0)
    real_estate = Column(Float, default=0)          # 부동산 순자산 (자산 - 부채)
    other = Column(Float, default=0)
    total = Column(Float, default=0)
    inv_savings     = Column(Float, default=0)      # 카테고리별 추가 투자금
    inv_overseas    = Column(Float, default=0)
    inv_isa         = Column(Float, default=0)
    inv_crypto      = Column(Float, default=0)
    inv_real_estate = Column(Float, default=0)
    note = Column(Text, default="")


class MonthlyRecord(Base):
    __tablename__ = "monthly_records"
    id = Column(String, primary_key=True, default=new_id)
    year_month = Column(String, nullable=False, unique=True)  # "2024-01"
    savings = Column(Float, default=0)
    overseas = Column(Float, default=0)
    isa = Column(Float, default=0)
    crypto = Column(Float, default=0)
    real_estate = Column(Float, default=0)
    other = Column(Float, default=0)
    total = Column(Float, default=0)
    inv_savings     = Column(Float, default=0)      # 카테고리별 추가 투자금
    inv_overseas    = Column(Float, default=0)
    inv_isa         = Column(Float, default=0)
    inv_crypto      = Column(Float, default=0)
    inv_real_estate = Column(Float, default=0)
    note = Column(Text, default="")
