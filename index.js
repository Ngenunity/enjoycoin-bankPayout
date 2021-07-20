const axios = require("axios");
const cryptojs = require("crypto-js");
const aws = require("aws-sdk"),
  region = "us-east-1",
  secretName = "Wyre";

// Create a Secrets Manager client
var secretClient = new aws.SecretsManager({
  region: region,
});

exports.handler = async (event, context, callback) => {
  if (event.field == "bankPayout") {
    try {
      const bankAccountId = event.arguments.bankAccountId;
      const walletId = event.arguments.defaultWalletId;
      const sourceAmount = event.arguments.sourceAmount;
      const wyreId = event.arguments.wyreId;
      let secretObj;

      const secretRes = await secretClient
        .getSecretValue({ SecretId: secretName })
        .promise();

      if ("SecretString" in secretRes) {
        secretObj = JSON.parse(secretRes.SecretString);
      }

      // Transfer ETH to destination
      const timestamp = new Date().getTime();
      const transferUrl = `https://api.sendwyre.com/v3/transfers?timestamp=${timestamp}`;
      //const accTransferUrl = `https://api.sendwyre.com/v3/transfers?timestamp=${timestamp}?masqueradeAs=${wyreId}`;

      // Calculate request signature
      const signature = (url, data) => {
        const dataToBeSigned = url + data;
        const token = cryptojs.enc.Hex.stringify(
          cryptojs.HmacSHA256(
            dataToBeSigned.toString(cryptojs.enc.Utf8),
            secretObj.wyreSecret
          )
        );
        return token;
      };

      const accBody = {
        source: `wallet:${walletId}`,
        sourceCurrency: "ETH",
        sourceAmount: sourceAmount,
        dest: `account:${wyreId}`,
        destCurrency: "USD",
        autoConfirm: true,
      };

      const accDetails = JSON.stringify(accBody);
      const accHeaders = {};
      accHeaders["Content-Type"] = "application/json";
      accHeaders["X-Api-Key"] = secretObj.wyreAPI;
      accHeaders["X-Api-Signature"] = signature(transferUrl, accDetails);

      const accConfig = {
        method: "POST",
        url: transferUrl,
        headers: accHeaders,
        data: accDetails,
      };

      const accTransferResponse = await axios(accConfig);
      console.log(accTransferResponse);

      const body = {
        source: `account:${wyreId}`,
        sourceCurrency: "USD",
        sourceAmount: sourceAmount,
        dest: `paymentmethod:${bankAccountId}`,
        destCurrency: "USD",
        autoConfirm: true,
      };

      const details = JSON.stringify(body);
      const transferHeaders = {};
      transferHeaders["Content-Type"] = "application/json";
      transferHeaders["X-Api-Key"] = secretObj.wyreAPI;
      transferHeaders["X-Api-Signature"] = signature(accTransferUrl, details);

      const transferConfig = {
        method: "POST",
        url: transferUrl,
        headers: transferHeaders,
        data: details,
      };

      if (accTransferResponse.status == 200) {
        console.log("Wallet to account transfer was successful!");
        const transferResponse = await axios(transferConfig);
        console.log(transferResponse);
      }

      callback(null, {
        id: transferResponse.data.id,
        status: transferResponse.status,
        sourceAmount: transferResponse.data.sourceAmount,
        source: transferResponse.data.source,
        dest: transferResponse.data.dest,
      });
    } catch (err) {
      console.log(err);
      //Create callback for errors
    }
  }
};
