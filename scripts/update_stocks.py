#!/usr/bin/env python3
"""Fetch stock data from Yahoo Finance and update _data/stocks.yml."""

from datetime import datetime, timedelta
from pathlib import Path

import yaml

MARKET_SUFFIXES = {
    "SH": ".SS",
    "SZ": ".SZ",
}


def fetch_stock(symbol: str, name: str, market: str, status: str, desc: str) -> dict:
    """Fetch OHLC history for a single stock."""
    try:
        import yfinance as yf
    except ImportError:
        print(f"yfinance not installed, skipping {symbol}")
        return {}

    # Adjust ticker for Chinese markets
    ticker_symbol = symbol
    if market in MARKET_SUFFIXES:
        ticker_symbol = f"{symbol}{MARKET_SUFFIXES[market]}"

    ticker = yf.Ticker(ticker_symbol)

    # Get last ~6 months of trading days
    end = datetime.now()
    start = end - timedelta(days=200)
    try:
        hist = ticker.history(start=start, end=end)
    except Exception as exc:
        print(f"Failed to fetch {symbol}: {exc}")
        return {}

    if hist.empty:
        print(f"No data for {symbol}")
        return {}

    current = float(hist["Close"].iloc[-1])
    prev = float(hist["Close"].iloc[-2]) if len(hist) >= 2 else current
    change = current - prev
    change_pct = (change / prev * 100) if prev != 0 else 0.0

    history = []
    for idx, row in hist.iterrows():
        history.append({
            "o": round(float(row["Open"]), 2),
            "h": round(float(row["High"]), 2),
            "l": round(float(row["Low"]), 2),
            "c": round(float(row["Close"]), 2),
        })

    currency = "¥" if market in ("SH", "SZ") else "$"

    return {
        "symbol": symbol,
        "name": name,
        "market": market,
        "currency": currency,
        "current": round(current, 2),
        "change": round(change, 2),
        "change_pct": round(change_pct, 2),
        "status": status,
        "desc": desc,
        "history": history,
    }


def normalize_stock_symbol(symbol: str, market: str) -> tuple[str, str]:
    """Strip supported Yahoo suffixes and return normalized symbol and market."""
    normalized_symbol = str(symbol).strip()
    normalized_market = str(market or "US").strip().upper() or "US"

    for candidate_market, suffix in MARKET_SUFFIXES.items():
        if normalized_symbol.upper().endswith(suffix):
            return normalized_symbol[:-len(suffix)], candidate_market

    return normalized_symbol, normalized_market


def load_stock_list() -> list[dict]:
    """Read stock list from _data/uses.yml FINANCIAL_SUBSYSTEM group."""
    uses_path = Path(__file__).parent.parent / "_data" / "uses.yml"
    with uses_path.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    stocks = []
    for group in data:
        if group.get("label") == "FINANCIAL_SUBSYSTEM":
            for item in group.get("items", []):
                symbol = item.get("version", "")
                name = item.get("name", "").split("(")[0].strip()
                status = item.get("status", "active")
                desc = item.get("desc", "")
                market = item.get("market", "US")
                symbol, market = normalize_stock_symbol(symbol, market)

                stocks.append({
                    "symbol": symbol,
                    "name": name,
                    "market": market,
                    "status": status,
                    "desc": desc,
                })
    return stocks


def load_existing_stocks(path: Path) -> dict[str, dict]:
    """Load existing stock data by symbol so failed fetches keep old data."""
    if not path.exists():
        return {}

    with path.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or []

    return {
        str(item.get("symbol", "")): item
        for item in data
        if isinstance(item, dict) and item.get("symbol")
    }


def main():
    repo_root = Path(__file__).parent.parent
    stocks_yml = repo_root / "_data" / "stocks.yml"

    stock_list = load_stock_list()
    existing_stocks = load_existing_stocks(stocks_yml)
    fetched_stocks = {}

    for stock in stock_list:
        print(f"Fetching {stock['symbol']}...")
        data = fetch_stock(
            symbol=stock["symbol"],
            name=stock["name"],
            market=stock["market"],
            status=stock["status"],
            desc=stock["desc"],
        )
        if data:
            fetched_stocks[stock["symbol"]] = data

    if not fetched_stocks:
        print("No stock data fetched.")
        return

    results = []
    for stock in stock_list:
        symbol = stock["symbol"]
        if symbol in fetched_stocks:
            results.append(fetched_stocks[symbol])
        elif symbol in existing_stocks:
            print(f"Keeping existing data for {symbol}.")
            results.append(existing_stocks[symbol])
        else:
            print(f"No new or existing data for {symbol}; omitting.")

    stocks_yml.parent.mkdir(parents=True, exist_ok=True)
    with stocks_yml.open("w", encoding="utf-8") as f:
        yaml.dump(
            results,
            f,
            allow_unicode=True,
            sort_keys=False,
            default_flow_style=False,
        )
    print(f"Updated {stocks_yml} with {len(fetched_stocks)} fresh stocks and {len(results)} total stocks.")


if __name__ == "__main__":
    main()
