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
      const timestampTwo = new Date().getTime();
      const paymentUrl = `https://api.sendwyre.com/v2/paymentMethod/${bankAccountId}?timestamp=${timestampTwo}&masqueradeAs=${wyreId}`;
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

      let bankEthAddress;

      const paymentHeaders = {};
      const paymentDetails = "";
      paymentHeaders["Content-Type"] = "application/json";
      paymentHeaders["X-Api-Key"] = secretObj.wyreAPI;
      paymentHeaders["X-Api-Signature"] = signature(paymentUrl, paymentDetails);

      const paymentConfig = {
        method: "GET",
        url: paymentUrl,
        headers: paymentHeaders,
      };

      const paymentResponse = await axios(paymentConfig);
      bankEthAddress = paymentResponse.data.blockchains.ETH;
      console.log(paymentResponse);

      const payoutBody = {
        source: `wallet:${walletId}`,
        sourceCurrency: "ETH",
        sourceAmount: sourceAmount,
        dest: `ethereum:${bankEthAddress}`,
        destCurrency: "ETH",
        autoConfirm: true,
      };

      const payoutDetails = JSON.stringify(payoutBody);
      const payoutHeaders = {};
      payoutHeaders["Content-Type"] = "application/json";
      payoutHeaders["X-Api-Key"] = secretObj.wyreAPI;
      payoutHeaders["X-Api-Signature"] = signature(transferUrl, payoutDetails);

      const payoutConfig = {
        method: "POST",
        url: transferUrl,
        headers: payoutHeaders,
        data: payoutDetails,
      };

      const payoutResponse = await axios(payoutConfig);
      console.log(payoutResponse);

      callback(null, {
        id: payoutResponse.data.id,
        status: payoutResponse.status,
        sourceAmount: payoutResponse.data.sourceAmount,
        source: payoutResponse.data.source,
        dest: payoutResponse.data.dest,
      });
    } catch (err) {
      console.log(err);
      //Create callback for errors
    }
  }
};
