const Web3 = require("web3")
const timestamp = require('time-stamp');
const abi = require('human-standard-token-abi');
require('dotenv').config()

const TOKEN_CONTRACT = "0x5ca9a71b1d01849c0a95490cc00559717fcf0d1d";
const WEB3_URL = process.env.NODE_WEB3_URL || process.argv[4];;
const SIZE_CHECKER = "0x52b034d64f150b9d6d39b9a9b9177d8a202e3f3e";
if (WEB3_URL == null) {
  console.log("No valid Ethereum node found in .env file ('NODE_WEB3_URL'), please provide one with -n flag, like \n $ node remaining_balances-CP-JSON.js -n wss://mainnet.infura.io/ws/v3/*YourAPIkey*");
  throw new Error("No Node URL provided to child process, check env file and/or child process spawn parameter ");
}


const provider = new Web3.providers.WebsocketProvider(WEB3_URL, {
  clientConfig: {
    maxReceivedFrameSize: 100000000,
    maxReceivedMessageSize: 100000000
  }
})
const web3 = new Web3(provider)
provider.on('error', error => {
  console.log(`${timestamp('DD.MM.YYYY : HH:mm.ss')} ` + 'WS Error');
  console.log(`${timestamp('DD.MM.YYYY : HH:mm.ss')} ` + error);
  throw error;
  process.exit(1);
});
provider.on('end', error => {
  console.log(`${timestamp('DD.MM.YYYY : HH:mm.ss')} ` + 'WS closed');
  console.log(`${timestamp('DD.MM.YYYY : HH:mm.ss')} ` + error);
  console.log(error)
  throw error;
  process.exit(1);
});

const AEToken = new web3.eth.Contract(abi, TOKEN_CONTRACT);
const SizeChecker = new web3.eth.Contract([{ "constant": true, "inputs": [{ "name": "addr", "type": "address" }], "name": "isContract", "outputs": [{ "name": "", "type": "bool" }], "payable": false, "stateMutability": "view", "type": "function" }], SIZE_CHECKER);

start();

async function start() {
  var fromBlock = process.argv[2];
  var toBlock = process.argv[3];

  if (fromBlock > toBlock) {
    console.log(`${timestamp('DD.MM.YYYY : HH:mm.ss')} ` + "Invalid start and/or end block!");
    process.exit(1);
  }
  try {
    var events = await AEToken.getPastEvents("Transfer", { fromBlock: fromBlock, toBlock: toBlock });
  } catch (error) {
    process.send([]);
    process.exit(1);
  }
  let addressPromises = [];
  let addresses = [];
  for (var i = 0; i < events.length; i++) {
    let to = events[i].returnValues._to;
    let blockNumber = events[i].blockNumber;
    if (to != process.env.NODE_BURNER_CONTRACT) {// if the recipent is not the token burner
      // check if it's a regular account
      addressPromises.push(new Promise(async (resolve) => {
        SizeChecker.methods.isContract(to).call().then(isContract => {
          console.log("FOUND " + to + ", current block: " + blockNumber)
          if (!isContract) {
            addresses.push(to);
          }
          return resolve();
        }).catch((error) => {
          console.log(error);
          return resolve();
        });

      }));
    }
  }
  await Promise.all(addressPromises);
  process.send(addresses);
  process.exit(0);
}