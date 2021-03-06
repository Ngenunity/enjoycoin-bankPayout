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
  try {
    const accountId = event.arguments.accountId;
    const bankAccountId = event.arguments.bankAccountId;
    const timestampOne = new Date().getTime();
    const walletUrl = `https://docs.sendwyre.com/docs/lookup-wallet?timestamp=${timestampOne}`

    let secretObj;

    const secretRes = await secretClient
      .getSecretValue({ SecretId: secretName })
      .promise();

    if ("SecretString" in secretRes) {
      secretObj = JSON.parse(secretRes.SecretString);
    }

      // Calculate account request signature
      const accSignature = (url, data) => {
        const dataToBeSigned = url + data;
        const token = cryptojs.enc.Hex.stringify(
          cryptojs.HmacSHA256(
            dataToBeSigned.toString(cryptojs.enc.Utf8),
            secretObj.wyreSecret
          )
        );
        return token;
      };

      const walletBody = {
        name: accountId
      };

      const walletDetails = JSON.stringify(walletBody);

      // Set request headers
      const headers = {};
      headers["Content-Type"] = "application/json";
      headers["X-Api-Key"] = secretObj.wyreAPI;
      headers["X-Api-Signature"] = accSignature(walletUrl, walletDetails);

      const config = {
        method: "GET",
        url: walletUrl,
        headers: headers,
      };

      // Get user wallet id
      const walletResponse = await axios(config);
      walletId = walletResponse.id;

      // Transfer ETH to destination
      const timestampTwo = new Date().getTime();
      const transferUrl = `https://api.sendwyre.com/v3/transfers?timestamp${timestampTwo}`;
      
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
        autoConfirm: true
      };

      const details = JSON.stringify(body);
      const transferHeaders = {};
      transferHeaders["Content-Type"] = "application/json";
      transferHeaders["X-Api-Key"] = secretObj.wyreAPI;
      transferHeaders["X-Api-Signature"] = signature(transferUrl, details);

      const transferConfig = {
        method: "POST",
        url: transferUrl,
        headers: transfersHeaders,
        data: details
      };

      const transferResponse = await axios(transferConfig);
      console.log(transferResponse);

      callback(null, {
          id: transferResponse.id,
          status: transferResponse.status,
          sourceAmount: transferResponse.sourceAmount,
          source: transferResponse.source,
          dest: transferResponse.dest
      });

  } catch (err) {
    console.log(err);
    //Create callback for errors
  }
};
