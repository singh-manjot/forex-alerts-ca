const functions = require("firebase-functions");
const admin = require("firebase-admin");
const puppeteer = require("puppeteer");
const { default: Axios } = require("axios");
const scrapeIt = require("scrape-it");
const { firestore } = require("firebase-admin");

admin.initializeApp();

const conversionsToLook = {
  CAD: "INR",
};

const CA_COUNTRY_CODE = "+1";
const PERSONAL_NUMBER = "2368823713";
const TWILIO_NUMBER = "7787215623";

// Get Market data
async function getMarketRate() {
  let queryParam = "";
  Object.keys(conversionsToLook).forEach((key) => {
    queryParam +=
      key.toString().toUpperCase() +
      "_" +
      conversionsToLook[key].toString().toUpperCase();
  });

  const data = await Axios.get(
    `https://free.currconv.com/api/v7/convert?apiKey=9a64e33b2844d9ec0c63&q=${queryParam}&compact=ultra` // use env here
  ).then((responseData) => {
    return responseData.data;
  });

  return data[queryParam];
}

async function getMoneyGramRate() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  const userAgent =
    "Mozilla/5.0 (X11; Linux x86_64)" +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.39 Safari/537.36";
  await page.setUserAgent(userAgent);
  await page.goto("https://www.moneygram.com/mgo/ca/en/", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  await page.waitForSelector("#send");

  await page.evaluate(() => {
    try {
      document.querySelector("#truste-consent-track").style.display = "none";
    } catch (e) {
      console.log("Could not hide the consent footer!!");
    }
  });
  await page.evaluate(() => {
    try {
      document.querySelector(".cdk-overlay-container").style.display = "none";
    } catch (e) {
      console.log("Could not hide the modal!!");
    }
  });

  const sendAmountInput = await page.$("#send");
  await sendAmountInput.click({ clickCount: 3 });
  await sendAmountInput.type("1");

  const receiverCountryInput = await page.$("#receiveCountry");
  await receiverCountryInput.type("India");

  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");

  await page.waitForSelector("#receiveAmount");

  const mgRate = await page.evaluate(() => {
    return document.querySelector("#receiveAmount").value;
  });

  await browser.close();

  return mgRate;
}

exports.lookUpMarketRates = functions.pubsub
  .schedule("15 8 * * *")
  .onRun(async () => {
    console.log("Beginning Scheduled Function..");

    let mgRate = await getMoneyGramRate();
    let marketRate = await getMarketRate();

    marketRate = marketRate.toPrecision(4);
    mgRate = Number(mgRate).toPrecision(4);

    const rateDiff = (marketRate - mgRate).toPrecision(3);

    if (rateDiff < 0.75) {
      let standardMessage = `Market Rate: Rs.${marketRate}, MoneyGram Rate: Rs.${mgRate}(Rate diff:${rateDiff}). `;

      if (rateDiff < 0.5) {
        ///store doc
        const result = await admin
          .firestore()
          .collection("forex-rates")
          .add({ marketRate, moneyGramRate: mgRate, rateDiff });

        standardMessage += `Stored data in Firestore document ${result.id}`;
      }

      await sendSMS(standardMessage);
    }
    console.log("Ending Scheduled Function..");
  });

async function sendSMS(messageBody = null) {
  const accountSid = "AC257e59dd88d5194a4918038146b5892c";
  const authToken = "c6e7d9c7d4899b3b2646d9fe1ddd0171";
  const client = require("twilio")(accountSid, authToken);
  try {
    const message = client.messages.create({
      body: messageBody ? messageBody : "This is a test message, eh?",
      from: CA_COUNTRY_CODE + TWILIO_NUMBER,
      to: CA_COUNTRY_CODE + PERSONAL_NUMBER,
    });

    console.log("Message sent with SID: " + message.sid);
  } catch (e) {
    console.log("Error sending message - ", e);
  }
  return null;
}
