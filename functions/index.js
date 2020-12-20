const functions = require("firebase-functions");
const admin = require("firebase-admin");
const puppeteer = require("puppeteer");
const { default: Axios } = require("axios");
const scrapeIt = require("scrape-it");

admin.initializeApp();
let conversionsToLook = {
  CAD: "INR",
};

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

  // response.json({ marketRate: data[queryParam] });
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

  // await page.screenshot({ path: "example.png" });

  await page.waitForSelector("#receiveAmount");
  const mgRate = await page.evaluate(() => {
    return document.querySelector("#receiveAmount").value;
  });
  await browser.close();

  return mgRate;
}

exports.getBothRates = functions.https.onRequest(async (req, response) => {
  const mgRate = await getMoneyGramRate();
  const marketRate = await getMarketRate();

  response.json({ mgRate: mgRate, marketRate: marketRate });
});
