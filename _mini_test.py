import requests
import time

data = {
    "amount": 99,
    "asset_id": 0,
    "user_id": 13
}

response0 = requests.post("http://localhost:3000/api/open", json=data)

time.sleep(3)

response1 = requests.post("http://localhost:3000/api/close", json=data)