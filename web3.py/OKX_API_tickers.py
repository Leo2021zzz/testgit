import requests
import pandas as pd
from datetime import datetime

def get_single_tricker_data(symbol):
    """
    单个交易对的ticker数据获取
    """

    # 行情信息 API URL
    ticker_url = f'https://www.okx.com/api/v5/market/ticker?instId={symbol}-SWAP'
    response_object  = requests.get(ticker_url)

    json_object = response_object.json()
    raw_df = pd.DataFrame(json_object)

    raw_df = pd.json_normalize(json_object,record_path=['data'])  # 将内嵌的数据完整的解析出来

    ticker_df = pd.DataFrame(index=[0],columns=['datetime','symbol','last'])
    ticker_df['datetime'] = pd.to_datetime(datetime.utcnow())
    ticker_df['symbol'] = symbol.replace('-','/')
    ticker_df['last'] = raw_df['last']

    return ticker_df

def get_tickers_data(symbols):

    """
    多个交易对的ticker数据获取与处理
    """
    tickers_df = pd.DataFrame()
    for symbol in symbols:
        ticker_df = get_single_tricker_data(symbol)
        tickers_df = tickers_df.append(ticker_df)

    return tickers_df

def main():
    """
        主函数
    """
    # == 1.  获取交易对的ticker信息
    # == 1.1 单个交易对的ticker数据获取与处理
    # symbol = 'BTC-USDT'
    # tricker_df = get_single_tricker_data(symbol)
    # print(tricker_df)

    # ==1.2  多个交易对的ticker数据获取与处理
    symbols = ['BTC-USDT','ETH-USDT','YGG-USDT']
    tickers_df = get_tickers_data(symbols)
    print(tickers_df)


if __name__ == '__main__':
    main() 