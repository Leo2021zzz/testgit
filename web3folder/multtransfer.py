from web3 import Web3
import time
import xlrd

w3 = Web3(Web3.HTTPProvider('你的rpc链接'))

private_key = "你的私钥"
address = "你的地址"
sleep_time = 5
file_name = "文件所在位置，第一列地址，第二列金额"


def init_address():
    # 从文件中获取收款地址和转账金额
    xls = xlrd.open_workbook(file_name)
    addresses = xls.sheets()[0].col_values(0)
    values = xls.sheets()[0].col_values(1)
    print("一共有 " + str(len(addresses)) + " 地址")
    return addresses, values


def send_eth():
    # 转账函数
    fromAddress = Web3.toChecksumAddress(address)
    addresseres, values = init_address()
    for _add, value in zip(addresseres, values):
        toAddress = Web3.toChecksumAddress(_add)
        nonce = w3.eth.getTransactionCount(fromAddress)
        balance = w3.eth.get_balance(toAddress)
        if w3.fromWei(balance, "ether") < value:
            continue
        gasPrice = w3.eth.gasPrice
        value = Web3.toWei(value, 'ether')
        gas = w3.eth.estimateGas({'from': fromAddress, 'to': toAddress, 'value': value})
        transaction = {'from': fromAddress,
                       'to': toAddress,
                       'nonce': nonce,
                       'gasPrice': gasPrice,
                       'gas': gas,
                       'value': value,
                       'data': ''}

        signed_tx = w3.eth.account.signTransaction(transaction, private_key)
        txn_hash = w3.eth.sendRawTransaction(signed_tx.rawTransaction)
        print(Web3.toHex(txn_hash))
        time.sleep(sleep_time)
        while w3.eth.getTransactionCount(fromAddress) == nonce:
            time.sleep(2)

def print_balance():
    # 打印每个地址的 ETH 余额
    addresseres = init_address()[0]
    for _add in addresseres:
        toAddress = Web3.toChecksumAddress(_add)
        balance = w3.eth.get_balance(toAddress)
        print('地址{0} => {1}'.format(_add, w3.fromWei(balance, 'ether')))

if __name__ == '__main__':
    send_eth()
    print_balance()