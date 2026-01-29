## 通过 OKX API 监控多币种汇率变动，并通过邮件提醒

import time
from okx_prices import get_prices
from send_email import send_email_via_remote_socks5_proxy

def get_email_content():
    symbols = ['DYDX-USDT', 'LDO-USDT', 'IMX-USDT', 'OP-USDT']
    prices, ratios = get_prices(symbols)

    # 创建邮件内容
    subject = "价格汇率变动"
    body = (
        f"1 DYDX = {1 / ratios['LDO']:.2f} LDO\n"
        f"1 DYDX = {1 / ratios['IMX']:.2f} IMX\n"
        f"1 DYDX = {1 / ratios['OP']:.2f} OP"
    )
    return subject, body

# 邮件信息
sender_email = ''
sender_name = '' ## 发件人昵称
receiver_email = [] ## 收件人列表，实现一对多发送
smtp_server = 'smtp.gmail.com'
smtp_port = 587
login = '@gmail.com'
password = ''

# 远程SOCKS5代理设置
proxy_address = ''
proxy_port =  1080
proxy_username = ''
proxy_password = ''

# 自动发送邮件每10分钟
interval = 600

print("价格波动检测机器人开始运行...")
while True:
    subject, body = get_email_content()
    send_email_via_remote_socks5_proxy(sender_email, sender_name, receiver_email, subject, body, smtp_server, smtp_port, login, password, proxy_address, proxy_port, proxy_username, proxy_password)
    print(f"等待 {interval // 60} 分钟后发送下一封邮件...")
    time.sleep(interval)
