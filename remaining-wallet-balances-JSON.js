// fix required: https://github.com/ethereum/web3.js/issues/1916
const Web3 = require("web3")
const fs = require('fs');
const timestamp = require('time-stamp');
const abi = require('human-standard-token-abi');

const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
const adapter = new FileSync('db.json')
const db = low(adapter);

const args = require('minimist')(process.argv.slice(2));

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config()
}

const TOKEN_CONTRACT = process.env.NODE_TOKEN_CONTRACT;
const WEB3_URL = process.env.NODE_WEB3_URL || args.n;
const DEFAULT_START_BLOCK = Number(process.env.NODE_START_BLOCK) || 4231524;
const SIZE_CHECKER = process.env.NODE_SIZE_CHECKER;

if (WEB3_URL == null) {
  console.log("No valid Ethereum node found in .env file ('NODE_WEB3_URL'), please provide one with -n flag, like \n $ node remaining_balances-CP-JSON.js -n wss://mainnet.infura.io/ws/v3/*YourAPIkey*");
  process.exit();
}

var provider = new Web3.providers.WebsocketProvider(WEB3_URL, {
  clientConfig: {
    maxReceivedFrameSize: 100000000,
    maxReceivedMessageSize: 100000000
  }
})
var web3 = new Web3(provider)
provider.on('error', error => {
  console.log(`${timestamp('DD.MM.YYYY : HH:mm.ss')} ` + 'WS Error');
  console.log(`${timestamp('DD.MM.YYYY : HH:mm.ss')} ` + error);
  throw error;
});
provider.on('end', error => {
  console.log(`${timestamp('DD.MM.YYYY : HH:mm.ss')} ` + 'WS closed');
  console.log(`${timestamp('DD.MM.YYYY : HH:mm.ss')} ` + error);
  console.log(error)
  provider = new Web3.providers.WebsocketProvider(WEB3_URL, {
    clientConfig: {
      maxReceivedFrameSize: 100000000,
      maxReceivedMessageSize: 100000000
    }
  })
  web3 = new Web3(provider)
});

const AEToken = new web3.eth.Contract(abi, TOKEN_CONTRACT);
const SizeChecker = new web3.eth.Contract([{ "constant": true, "inputs": [{ "name": "addr", "type": "address" }], "name": "isContract", "outputs": [{ "name": "", "type": "bool" }], "payable": false, "stateMutability": "view", "type": "function" }], SIZE_CHECKER);
var addressMap = {};
var eventPromises = [];

console.log("START: " + new Date());

startSearching();
var addressPromises = [];
var balancePromises =[];
async function startSearching() {
  // get block number
  // contract deployment block MAINNET 4231524 | TEST 3928177
  var fromBlock = args.f == null ? DEFAULT_START_BLOCK : args.f;
  let latest = await web3.eth.getBlockNumber();
  var toBlock = args.t == null ? latest : args.t;

  if (fromBlock > toBlock) {
    console.log(`${timestamp('DD.MM.YYYY : HH:mm.ss')} ` + "Invalid start and/or end block!");
    process.exit(1);
  }

  let currentBlock = fromBlock;

  while (currentBlock < toBlock) {
    console.log("Starting searching... block " + currentBlock);
    let eventPromise = AEToken.getPastEvents("Transfer", { fromBlock: currentBlock, toBlock: currentBlock + 1000 });
    eventPromises.push(eventPromise);
    let cb = currentBlock;
    eventPromise.then(async (events) => {
      console.log("Found " + events.length + "  transfer events");
      let addresses = [];
      for (var i = 0; i < events.length; i++) {
        let to = events[i].returnValues._to;
        let blockNumber = events[i].blockNumber;
        if (to != process.env.NODE_BURNER_CONTRACT) {// if the recipent is not the token burner
          // check if it's a regular account
          if (addressMap[to] == null) {
            addressMap[to] = true;
            addressPromises.push(new Promise(async (resolve) => {
              try {
                let isContact = await SizeChecker.methods.isContract(to).call();
                if (!isContact) {
                  console.log("Found holder: " + to + ", current block: " + blockNumber);
                  addresses.push(to);
                  startChecking(to, blockNumber);
                }
                return resolve();
              } catch (error) {
                console.log(`${timestamp('DD.MM.YYYY : HH:mm.ss')} ` + "Error checking account type: ");
                console.log(error)
                fs.appendFileSync("./error.log", error + "\nBLOCK: " + blockNumber + "\nACCOUNT: " + to);
                resolve();
                throw error;
              }
            }));
          }
        }
      }

    }).catch((error) => {
      console.log(`${timestamp('DD.MM.YYYY : HH:mm.ss')} ` + "Error fetching transfer events: ");
      fs.appendFileSync("./error.log", error + "\nBLOCK: " + cb);
      throw error;
    })
    currentBlock += 1000;
  }
  await Promise.all(eventPromises);
  await Promise.all(addressPromises);
  await Promise.all(balancePromises);
  console.log("END: " + new Date());
  process.exit(0);
}

function startChecking(address, blockNumber) {
  console.log("Starting checking... address " + address);

  let balancePromise = AEToken.methods.balanceOf(address).call();
  balancePromises.push(balancePromise);
  balancePromise.then (balance => {
    console.log("Found balance: " + balance + ", block: " + blockNumber);
    let balanceBN = web3.utils.toBN(balance);
    console.log("Hre is the balance as bignumber", balanceBN)
    if (balanceBN.gt(web3.utils.toBN(0))) {
      console.log("Transfering balance to db")
      db.set(address, balanceBN.toString()).write();
    }
  }).catch (error => {
    console.log(`${timestamp('DD.MM.YYYY : HH:mm.ss')} ` + "Error checking balance: ");
    fs.appendFileSync("./error.log", error + "\nBLOCK: " + blockNumber + "\nHOLDER: " + address);
  })
}
