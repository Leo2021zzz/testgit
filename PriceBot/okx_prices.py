import requests
import pandas as pd
from datetime import datetime

def get_single_ticker_data(symbol):
    """
    单个交易对的ticker数据获取
    """
    ticker_url = f'https://www.okx.com/api/v5/market/ticker?instId={symbol}-SWAP'
    response_object = requests.get(ticker_url)
    json_object = response_object.json()
    raw_df = pd.json_normalize(json_object, record_path=['data'])  # 将内嵌的数据完整的解析出来

    ticker_df = pd.DataFrame(index=[0], columns=['datetime', 'symbol', 'last'])
    ticker_df['datetime'] = pd.to_datetime(datetime.now())
    ticker_df['symbol'] = symbol.replace('-', '/').lower()
    ticker_df['last'] = raw_df['last']

    return ticker_df

def get_tickers_data(symbols):
    """
    多个交易对的ticker数据获取与处理
    """
    tickers_df = pd.DataFrame()
    for symbol in symbols:
        ticker_df = get_single_ticker_data(symbol)
        tickers_df = pd.concat([tickers_df, ticker_df])

    return tickers_df

def get_prices(symbols):
    """
    获取价格并计算比率
    """
    tickers_df = get_tickers_data(symbols)
    
    # 确保将价格转换为浮点数
    prices = {symbol: float(tickers_df[tickers_df['symbol'] == symbol.replace('-', '/').lower()]['last'].values[0])
              for symbol in symbols}

    # 计算比率，以 DYDX 为基准
    dydx_price = prices['DYDX-USDT']
    ratios = {
        'LDO': prices['LDO-USDT'] / dydx_price,
        'IMX': prices['IMX-USDT'] / dydx_price,
        'OP': prices['OP-USDT'] / dydx_price
    }

    return prices, ratios
