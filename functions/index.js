const functions = require("firebase-functions");
const admin = require("firebase-admin");
const puppeteer = require("puppeteer");
const { default: Axios } = require("axios");
admin.initializeApp();

const CA_COUNTRY_CODE = "+1";
const PERSONAL_NUMBER = "2368823713";
const TWILIO_NUMBER = "7787215623";

exports.lookUpMarketRates = functions.pubsub
  .schedule("15 8 * * *")
  .onRun(async () => {

    const mgRate = await getMoneyGramRate();
    const marketRate = await getMarketRate();

    const rateDiff = (marketRate - mgRate).toPrecision(3);

    let standardMessage = `Market Rate: Rs.${marketRate}, MoneyGram Rate: Rs.${mgRate}(Rate diff:${rateDiff}). `;

    if (rateDiff < 0.5) {
      console.log("Storing Rates...");
      storeRates(marketRate, mgRate, rateDiff);
      standardMessage += "Results stored in Firebase.";
    }

    if (rateDiff < 0.75) {
      console.log(`Rate difference is good(${rateDiff}), sending SMS...`);
      return sendSMS(standardMessage);
    } else {
      console.log("Rate Difference not good enough, no SMS sent.");
      return 0;
    }
  });

const storeRates = async (marketRate, moneyGramRate, rateDiff) => {
  ///store document
  await admin
    .firestore()
    .collection("forex-rates")
    .add({ marketRate, moneyGramRate, rateDiff });
};

// Get Market data
const getMarketRate = async () => {
  const data = await Axios.get(
    `https://api.ratesapi.io/api/latest?base=CAD&symbols=INR`
  )
    .then((responseData) => {
      return responseData.data.rates;
    })
    .catch((err) => {
      console.log("ERROR: ", err);
    });

  return data["INR"].toPrecision(4);
};

// Get MoneyGram Rate
const getMoneyGramRate = async () => {
  const browser = await puppeteer.launch({
    //running chrome as root is not supported directly
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  const userAgent =
    "Mozilla/5.0 (X11; Linux x86_64)" +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.39 Safari/537.36";
  await page.setUserAgent(userAgent);
  await page.goto(functions.config().forex_site.url, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  await page.waitForSelector("#send");

  page.evaluate(() => {
    try {
      document.querySelector("#truste-consent-track").style.display = "none";
    } catch (e) {
      console.log("Could not hide the consent footer!!");
    }
  });
  page.evaluate(() => {
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

  return Number(mgRate).toPrecision(4);
};

const sendSMS = async (messageBody) => {
  const client = require("twilio")(functions.config().twilio.account_sid, functions.config().twilio.auth_token);

  return await client.messages.create({
    body: messageBody,
    from: CA_COUNTRY_CODE + TWILIO_NUMBER,
    to: CA_COUNTRY_CODE + PERSONAL_NUMBER,
  }).sid;
};
