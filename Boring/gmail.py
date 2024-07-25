import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import socks
import socket
import time

def setup_socks5_proxy(proxy_address, proxy_port, proxy_username=None, proxy_password=None):
    # 设置远程SOCKS5代理，包含用户名和密码（如果需要）
    if proxy_username and proxy_password:
        socks.set_default_proxy(socks.SOCKS5, proxy_address, proxy_port, True, proxy_username, proxy_password)
    else:
        socks.set_default_proxy(socks.SOCKS5, proxy_address, proxy_port)
    socket.socket = socks.socksocket  # 替换默认的socket

def send_email_via_remote_socks5_proxy(sender_email, receiver_email, subject, body, smtp_server, smtp_port, login, app_password, proxy_address, proxy_port, proxy_username=None, proxy_password=None):
    # 创建邮件消息
    msg = MIMEMultipart()
    msg['From'] = sender_email
    msg['To'] = receiver_email
    msg['Subject'] = subject
    
    # 使用UTF-8编码创建邮件正文
    body = body.encode('utf-8')
    msg.attach(MIMEText(body.decode('utf-8'), 'plain', 'utf-8'))

    try:
        # 设置SOCKS5代理
        setup_socks5_proxy(proxy_address, proxy_port, proxy_username, proxy_password)
        
        # 创建SMTP会话
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()  # 启用TLS
            server.login(login, app_password)  # 使用应用专用密码登录SMTP服务器
            server.sendmail(sender_email, receiver_email, msg.as_string())  # 发送邮件
            print("Email sent successfully!")
    except Exception as e:
        print(f"Error: {e}")

# 邮件信息
sender_email = ''
receiver_email = ''
subject = ''
body = '这是一封通过 python 发送的邮件'
smtp_server = 'smtp.gmail.com'
smtp_port = 587
login = ''
password = ''


# SOCKS5代理设置
proxy_address = ''
proxy_port =   # SOCKS5代理端口
proxy_username = ''
proxy_password = ''

# 自动发送邮件每5分钟
interval = 300  # 300秒 = 5分钟

while True:
    send_email_via_remote_socks5_proxy(sender_email, receiver_email, subject, body, smtp_server, smtp_port, login, password, proxy_address, proxy_port, proxy_username, proxy_password)
    print(f"Waiting {interval // 60} minutes before sending the next email...")
    time.sleep(interval)  # 等待5分钟
