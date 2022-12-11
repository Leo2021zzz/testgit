from web3 import Web3

url = ''  # RPC 地址
web3 = Web3(Web3.HTTPProvider(url))
account_1 = ''  # 转账地址
private_key1 = '' # 转账地址的私钥
account_2 = '' # 接收地址

#获取nonce，防止双花
nonce = web3.eth.getTransactionCount(account_1)

#将交易信息放入字典
tx = {
    'nonce': nonce,
    'to': account_2,
    'value': web3.toWei(0.001, 'ether'),  # 默认转账 0.001 Eth
    'gas': 210000,   # 默认转账 gasLimit 21000
    'gasPrice': web3.toWei('5', 'gwei')  # 默认转账 gasPric 5 Gwei
}

#签名交易
signed_tx = web3.eth.account.sign_transaction(tx, private_key1)

#发送交易
tx_hash = web3.eth.sendRawTransaction(signed_tx.rawTransaction)

#获取交易哈希
print(web3.toHex(tx_hash))