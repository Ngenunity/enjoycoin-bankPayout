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
      const timestampThree = new Date().getTime();
      const timestampFour = new Date().getTime();
      const paymentUrl = `https://api.sendwyre.com/v2/paymentMethod/${bankAccountId}?timestamp=${timestampTwo}&masqueradeAs=${wyreId}`;
      const transferUrl = `https://api.sendwyre.com/v3/transfers?timestamp=${timestampThree}`;
      const payoutUrl = `https://api.sendwyre.com/v3/transfers?timestamp=${timestampFour}&masqueradeAs=${wyreId}`;
      const accountUrl = `https://api.sendwyre.com/v3/accounts/${wyreId}?masqueradeAs=${wyreId}&timestamp=${timestamp}`;

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

      // Calculate account request signature
      const accSignature = (url) => {
        const dataToBeSigned = url;
        const token = cryptojs.enc.Hex.stringify(
          cryptojs.HmacSHA256(
            dataToBeSigned.toString(cryptojs.enc.Utf8),
            secretObj.wyreSecret
          )
        );
        return token;
      };

      // Set request headers
      const accHeaders = {};
      accHeaders["Content-Type"] = "application/json";
      accHeaders["X-Api-Key"] = secretObj.wyreAPI;
      accHeaders["X-Api-Signature"] = accSignature(accountUrl);

      const accConfig = {
        method: "GET",
        url: accountUrl,
        headers: accHeaders,
      };

      const accResponse = await axios(accConfig);
      console.log(accResponse);
      let accEthAddress = accResponse.data.depositAddresses.ETH;
      console.log("Account ETH address", accEthAddress);

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

      const body = {
        source: `wallet:${walletId}`,
        sourceCurrency: "ETH",
        sourceAmount: sourceAmount,
        dest: `ethereum:${accEthAddress}`,
        destCurrency: "ETH",
        autoConfirm: true,
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

      const payoutBody = {
        source: `account:${wyreId}`,
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
      payoutHeaders["X-Api-Signature"] = signature(payoutUrl, payoutDetails);

      const payoutConfig = {
        method: "POST",
        url: payoutUrl,
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
