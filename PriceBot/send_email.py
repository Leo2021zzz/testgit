## 邮件设置

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import socks
import socket

def setup_socks5_proxy(proxy_address, proxy_port, proxy_username=None, proxy_password=None):
    if proxy_username and proxy_password:
        socks.set_default_proxy(socks.SOCKS5, proxy_address, proxy_port, True, proxy_username, proxy_password)
    else:
        socks.set_default_proxy(socks.SOCKS5, proxy_address, proxy_port)
    socket.socket = socks.socksocket

def send_email_via_remote_socks5_proxy(sender_email, sender_name, receiver_emails, subject, body, smtp_server, smtp_port, login, app_password, proxy_address, proxy_port, proxy_username=None, proxy_password=None):
    msg = MIMEMultipart()
    msg['From'] = f"{sender_name} <{sender_email}>"
    msg['To'] = ", ".join(receiver_emails)
    msg['Subject'] = subject

    msg.attach(MIMEText(body, 'plain', 'utf-8'))

    try:
        setup_socks5_proxy(proxy_address, proxy_port, proxy_username, proxy_password)
        
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(login, app_password)
            server.sendmail(sender_email, receiver_emails, msg.as_string())
            print("Email sent successfully!")
    except Exception as e:
        print(f"Error: {e}")

