# -*- coding: utf-8 -*-
import requests
import pandas as pd
from datetime import datetime

def get_single_ticker_data(symbol):
    """
    单个交易对的ticker数据获取
    """

    # 检查本地代理端口，默认1080
    proxy_pool = {
	'http': 'http://127.0.0.1:1080',  
	'https': 'https://127.0.0.1:1080',
}
    # 行情信息 API URL
    ticker_url = f'https://www.okx.com/api/v5/market/ticker?instId={symbol}-SWAP'

    # 请求 API 数据并制成 json 文件
    response_object  = requests.get(ticker_url,proxies=proxy_pool,timeout=3)
    json_object = response_object.json()

    # 将默认的 json 文件赋值给 raw_df
    raw_df = pd.DataFrame(json_object)
    raw_df = pd.json_normalize(json_object,record_path=['data'])  # 将内嵌的数据完整的解析出来

    # 自定义表格 tricker_df，定义自己想要的数据
    ticker_df = pd.DataFrame(index=[0],columns=['datetime','symbol','last'])
    ticker_df['datetime'] = pd.to_datetime(datetime.utcnow())
    ticker_df['symbol'] = symbol.replace('-','/')
    ticker_df['last'] = raw_df['last']

    return ticker_df

def get_tickers_data(symbols):

    """
    多个交易对的ticker数据获取与处理
    """

    # 自定义表格 tickers_df，使用循环将 ticker 添加到 tickers 中
    tickers_df = pd.DataFrame()
    for symbol in symbols:
        ticker_df = get_single_ticker_data(symbol)
        tickers_df = pd.concat([tickers_df,ticker_df])

    return tickers_df

def main():
    """
        主函数
    """
    # == 1.  获取交易对的ticker信息

    # == 1.1 单个交易对的ticker数据获取与处理
    # symbol = 'BTC-USDT'
    # ticker_df = get_single_ticker_data(symbol)
    # print(ticker_df)

    # ==1.2  多个交易对的ticker数据获取与处理
    symbols = ['BTC-USDT','ETH-USDT','YGG-USDT']
    tickers_df = get_tickers_data(symbols)
    print(tickers_df)

# 当模块被直接运行时，以下代码块将被运行；当模块是被导入时，以下代码块不被运行
if __name__ == '__main__':
    main() 