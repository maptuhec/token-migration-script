// fix required: https://github.com/ethereum/web3.js/issues/1916
const Web3 = require("web3")
const timestamp = require('time-stamp');
const abi = require('human-standard-token-abi');
const args = require('minimist')(process.argv.slice(2));
const crypto = require('crypto');

const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
const adapter = new FileSync('wallets-db.json')
const db = low(adapter);
require('dotenv').config()

var cp = require('child_process');

const TOKEN_CONTRACT = "0x5ca9a71b1d01849c0a95490cc00559717fcf0d1d";
const WEB3_URL = process.env.NODE_WEB3_URL || args.n;
const DEFAULT_START_BLOCK = Number(process.env.NODE_START_BLOCK) || 4231524;

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
console.log("START: " + new Date());

let pendingCheckPromises = [];
let step = 1000;
startSearching();

async function startSearching() {
  // get block number
  // contract deployment block MAINNET 4231524 | TEST 3928177
  var fromBlock = args.f == null ? DEFAULT_START_BLOCK : args.f;
  if (fromBlock < 4280000) step = 300;
  let latest = await web3.eth.getBlockNumber();
  var toBlock = args.t == null ? latest : args.t;

  if (fromBlock > toBlock) {
    console.log(`${timestamp('DD.MM.YYYY : HH:mm.ss')} ` + "Invalid start and/or end block!");
    process.exit(1);
  }

  let currentBlock = fromBlock;
  let childPromises = [];

  while (currentBlock < toBlock) {
    if (currentBlock > 4280000) step = 1000;
    let messages = [];
    for (var i = 0; i < 2; i++) {
      (function (i) {
        childPromises.push(new Promise((resolve, reject) => {
          var child = cp.fork('./getAllWalletAddresses.js', [currentBlock, currentBlock + step, WEB3_URL], {
            silent: true
          });
          child.stdout.on('data', function (data) {
            console.log("" + data);
          });

          child.stderr.on('data', function (data) {
            console.log('stdout: ' + data);
            messages.push([]);
            resolve();
          });

          child.on('message', function (msg) {
            messages.push(msg);
          });

          child.on('close', function (code) {
            console.log('closing code: ' + code);
            resolve();
          });
          // give 10 min to resolve, otherwise rerun
          setTimeout(() => {
            messages.push(i);
            child.kill(1);
            resolve();
          }, 600000)
        }));
      })(i)
    }
    await Promise.all(childPromises);
    console.log(messages)
    let hash1 = crypto.createHash('md5').update(JSON.stringify(messages[0])).digest('hex');
    let hash2 = crypto.createHash('md5').update(JSON.stringify(messages[1])).digest('hex');
    if (hash1 == hash2) {
      currentBlock += step;
      checkBalanceAndSave(messages[0]);
    }
  }

  await Promise.all(pendingCheckPromises);
  console.log("END: " + new Date());
  process.exit(0);
}

async function checkBalanceAndSave(addresses) {
  for (let i = 0; i < addresses.length; i++) {
    let balancePromise = AEToken.methods.balanceOf(addresses[i]).call();
    pendingCheckPromises.push(balancePromise);
    balancePromise.then((balance) => {
      console.log("Found balance: " + balance);
      let balanceBN = web3.utils.toBN(balance);
      if (balanceBN.gt(web3.utils.toBN(0))) {
        db.set(addresses[i], balanceBN.toString()).write();
      }
    }).catch((error) => {
      console.log(error);
      let balancePromise = AEToken.methods.balanceOf(addresses[i]).call();
      pendingCheckPromises.push(balancePromise);
      balancePromise.then((balance) => {
        console.log("Found balance: " + balance);
        let balanceBN = web3.utils.toBN(balance);
        if (balanceBN.gt(web3.utils.toBN(0))) {
          db.set(addresses[i], balanceBN.toString()).write();
        }
      })
    })
  }
}