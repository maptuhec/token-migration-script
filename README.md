# Aeternity AllBalanceGetter

Fetches all Aeternity ERC20 Token Balances, checks wehther an account is a contract or not.


Example usage (applicable for all scripts) : `node remaining_balances-CP-JSON.js [-f <from-block>] [-t <to-block>] [-n <websocket URL of ethereum node provider>]`

Args: 

`-f` The block where to start scanning from. Default value: 4231524 

`-t` The block where to stop scanning. Default value: current latest block

`-n` The websocket URL to your Ethereum node, most likely Infura. Default for the team: Internal URL from .env file.


## remaining-wallet-balances-CP-JSON.js
Searches for holder addresses (wallets) in 2 child processes, then checks the balances and writes to JSON

~4h for all blocks

## remaining-contract-balances-CP-JSON.js
Searches for holder addresses (contracts) in 2 child processes, then checks the balances and writes to JSON

~4h for all blocks

## remaining-wallet-balances-JSON.js
Searches for holder addresses in parallel, writes to JSON

~1.5h, but enormous memory usage. 

Solution: 4x run a 1 000 000 blocks [4231524-5231524] [5231524-6231524] [6231524-7231524] [7231524-current] 
## remaining-wallet-balances-BACKENDLESS.js
Searches for holder addresses in parallel, writes to backendless

~1.5h, but enormous memory usage. Solution: 4x run a 1 000 000 blocks

--> if memory limit reached, use `-–max-old-space-size=12000`

! `.env` file is required for DB credentials !


