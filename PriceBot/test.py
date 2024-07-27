## 测试 API 是否正常响应

import requests

try:
    response = requests.get('https://www.okx.com/api/v5/market/ticker?instId=DYDX-USDT-SWAP', timeout=10)
    response.raise_for_status()
    # 处理响应
except requests.exceptions.RequestException as e:
    print(f"发生错误：{e}")
