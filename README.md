# Pumpfun Copy Trading Bot

You can monitor target wallet and copy trade automatically using this bot.


# 💬Contact Me

If you have any question or something, feel free to reach out me anytime via telegram, discord or twitter.
<br>

Discord: @erikerik116 <br>

Telegram: @erikerik116 <br>

twitter: @erikerikerik116 <br>


# 👀Usage
1. Clone the repository

    ```
    git clone https://github.com/erikerik116/pumpfun-copy-trading-bot-v1.git
    cd pumpfun-copy-trading-bot-v1
    ```
2. Install dependencies

    ```
    npm install
    ```
3. Configure the environment variables

    Rename the .env.example file to .env and set RPC and WSS, main keypair's secret key, and others.

4. Run the bot

    ```
    npm start
    ```


## .env config

PRIVATE_KEY = # Your wallet private key

RPC_ENDPOINT = # 

GRPC_ENDPOINT = # Yellowstone GRPC endpoint

GRPC_TOKEN = # Yellowstone GRPC token

BUY_AMOUNT = 0.00001

IS_JITO = true # true/false

JITO_FEE = 0.0001

TARGET_ADDRESS = # Your target wallet to copy trade

PURCHASE_PERCENT = 100  # %

MAX_LIMIT = 0.0005 # sol

