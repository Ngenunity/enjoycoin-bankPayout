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

      const body = {
        source: `wallet:${walletId}`,
        sourceCurrency: "ETH",
        sourceAmount: sourceAmount,
        dest: `paymentmethod:${bankAccountId}`,
        destCurrency: "USD",
        autoConfirm: false,
      };

      const details = JSON.stringify(body);
      const transferHeaders = {};
      transferHeaders["Content-Type"] = "application/json";
      transferHeaders["X-Api-Key"] = secretObj.wyreAPI;
      transferHeaders["X-Api-Signature"] = signature(transferUrl, details);

      const transferConfig = {
        method: "POST",
        url: transferUrl,
        headers: transferHeaders,
        data: details,
      };

      const transferResponse = await axios(transferConfig);
      console.log(transferResponse);

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
