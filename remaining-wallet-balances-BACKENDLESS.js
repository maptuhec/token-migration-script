// fix required: https://github.com/ethereum/web3.js/issues/1916
const Web3 = require("web3")
const axios = require('axios')
const fs = require('fs');
const timestamp = require('time-stamp');
const abi = require('human-standard-token-abi');

const args = require('minimist')(process.argv.slice(2));

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config()
}

const TOKEN_CONTRACT = process.env.NODE_TOKEN_CONTRACT;
const WEB3_URL = process.env.NODE_WEB3_URL || args.n;
const BL_ID = process.env.NODE_BL_ID
const BL_KEY = process.env.NODE_BL_KEY
const BL_URL = `https://api.backendless.com/${BL_ID}/${BL_KEY}`
const LOGIN = process.env.NODE_BL_LOGIN;
const PASSWORD = process.env.NODE_BL_PASSWORD;
const TABLE = process.env.NODE_BL_HOLDERS_TABLE;
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

let loginRequestHeaders = {
  "Content-Type": "application/json",
};

console.log("START: " + new Date());

var user_token = '54F965A2-ED48-1BDA-FF43-BD8CA63BFF00';

// var user_token;
// axios.post(
//   `${BL_URL}/users/login`,
//   { login: LOGIN, password: PASSWORD },
//   { headers: loginRequestHeaders })
//   .then(async function (response) {
//     user_token = response.data["user-token"];
//     console.log(`${timestamp('DD.MM.YYYY : HH:mm.ss')} ` + "LOGGED IN. User token: " + user_token);
//   }).catch((err) => {
//     console.log(`${timestamp('DD.MM.YYYY : HH:mm.ss')} ` + "LOGIN to backendless FAILED!");
//     console.log(err);
//     throw err;
//   });

startSearching();
var addressPromises = [];
var balancePromises = [];
var blPromises = [];
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

async function startChecking(address, blockNumber) {
  console.log("Starting checking... address " + address);

  let balancePromise = AEToken.methods.balanceOf(address).call();
  balancePromises.push(balancePromise);
  balancePromise.then(balance => {
    console.log("Found balance: " + balance);
    let balanceBN = web3.utils.toBN(balance);
    if (balanceBN.gt(web3.utils.toBN(0))) {
      // save in BL
      let blPromise = axios.post(
        `${BL_URL}/data/${TABLE}`, {
          "address": address,
          "balance": balanceBN.toString()
        },
        { headers: { "user-token": user_token } })
      blPromises.push(blPromise);
      blPromise.then(response => {
        if (response.status == 200) {
          console.log(`${timestamp('DD.MM.YYYY : HH:mm.ss')} ` + "----- Data saved with ID " + response.data['objectId'] + ", block " + blockNumber)
        } else {
          console.log(`${timestamp('DD.MM.YYYY : HH:mm.ss')} ` + "----- Data couldn't be saved! " + response);
        }
      }).catch(error => {
        console.log(`${timestamp('DD.MM.YYYY : HH:mm.ss')} ` + "Backendless error:")
        console.log(`${timestamp('DD.MM.YYYY : HH:mm.ss')} ` + error);
        // 1155 is `duplicateValue`, that is normal because of redundancy
        if (error.response.data.code == 1155) {
          let blPromise = axios.get(
            `${BL_URL}/data/${TABLE}?where=address%3D%27${address}%27`);
          blPromises.push(blPromise);
          blPromise.then(response => {
            if (!balanceBN.eq(web3.utils.toBN(response.data[0].balance))) {
              let updatePromise = axios.post(
                `${BL_URL}/data/${TABLE}/${response.data[0].objectId}"`,
                { "balance": balanceBN.toString() },
                { headers: { "user-token": user_token } });
              blPromises.push(updatePromise);
              updatePromise.then(updateResponse => {
                if (updateResponse.status == 200) {
                  console.log(`${timestamp('DD.MM.YYYY : HH:mm.ss')} ` + "----- Data with ID " + response.data[0]['objectId'] + " updated");
                } else {
                  console.log(`${timestamp('DD.MM.YYYY : HH:mm.ss')} ` + "----- Data couldn't be updated! " + updateResponse);
                  fs.appendFileSync("./error.log", "----- Data couldn't be updated! " + updateResponse + " \nADDRESS: " + address);
                }
              }).catch(error => {
                console.log(`${timestamp('DD.MM.YYYY : HH:mm.ss')}`);
                fs.appendFileSync("./error.log", error + " \nADDRESS: " + address);
                console.log(error);
              })
            }

          }).catch(error => {
            console.log(`${timestamp('DD.MM.YYYY : HH:mm.ss')}`);
            fs.appendFileSync("./error.log", error + " \nADDRESS: " + address);
            console.log(error);
          })

        } else {
          console.log(`${timestamp('DD.MM.YYYY : HH:mm.ss')}`);
          fs.appendFileSync("./error.log", error + " \nADDRESS: " + address);
          console.log(error);
        }
      })
    } else {
      // check if there's an object in backendless and remove it
      let blPromise = axios.get(
        `${BL_URL}/data/${TABLE}?where=address%3D%27${address}%27`);
      blPromises.push(blPromise);
      blPromise.then(response => {
        if (response.data[0] != null) {
          let deletePromise = axios.post(
            `${BL_URL}/data/${TABLE}/${response.data[0].objectId}`,
            { headers: { "user-token": user_token } });
          blPromises.push(deletePromise);
          deletePromise.then(deleteResponse => {
            if (deleteResponse.status == 200) {
              console.log(`${timestamp('DD.MM.YYYY : HH:mm.ss')} ` + "----- Data with ID " + response.data[0]['objectId'] + " deleted");
            } else {
              console.log(`${timestamp('DD.MM.YYYY : HH:mm.ss')} ` + "----- Data couldn't be deleted! " + deleteResponse);
            }
          }).catch(error => {
            console.log(`${timestamp('DD.MM.YYYY : HH:mm.ss')}`);
            fs.appendFileSync("./error.log", error + " \nADDRESS: " + address);
            console.log(error);
          })
        }
      }).catch(error => {
        console.log(`${timestamp('DD.MM.YYYY : HH:mm.ss')}`);
        fs.appendFileSync("./error.log", error + " \nADDRESS: " + address);
        console.log(error);
      })
    }
  }).catch(error => {
    console.log(`${timestamp('DD.MM.YYYY : HH:mm.ss')} ` + "Error checking account type: ");
    console.log(error)
    fs.appendFileSync("./error.log", error + "\nBLOCK: " + blockNumber + "\nACCOUNT: " + to);
  })


}
