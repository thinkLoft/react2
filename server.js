var express = require("express");
var logger = require("morgan");
var mongoose = require("mongoose");
const CronJob = require("cron").CronJob;

// Our scraping tools
// Axios is a promised-based http library, similar to jQuery's Ajax method
// It works on the client and on the server
var axios = require("axios");
var cheerio = require("cheerio");
var fs = require("fs");
var request = require("request");

// Our Puppeteer
const puppeteer = require("puppeteer");

// Require all models
var db = require("./models");

var PORT = 7000;

// Initialize Express
var app = express();

// Configure middleware

// Use morgan logger for logging requests
app.use(logger("dev"));
// Parse request body as JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// Make public a static folder
app.use(express.static("public"));

// Connect to the Mongo DB
var MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost/unit18Populater";

mongoose.connect(
  MONGODB_URI,
  { useNewUrlParser: true }
);

// Load Puppeteer browser
async function postItem(i) {
  var user = {
    username: "automater",
    password: "llipDR3x8S2DUHAnyo"
  };
  await console.log(i.title);
  const makeSub = i.make.substring(0, 4);

  const browser = await puppeteer.launch({
    headless: false,
    timeout: 150000,
    networkIdleTimout: 150000
  });

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(240000);

  await page.goto("https://doubleupja.com/create-listing/");
  await page.evaluate(user => {
    $("#login_username").val(user.username);
    $("#login_password").val(user.password);
    $("#login").click();
  }, user);
  await page.waitForNavigation();

  await page.focus("#ad_cat_id");
  await page.keyboard.press("ArrowDown", { delay: 50 });
  await page.evaluate(() => {
    $("form#mainform").submit();
  });
  await page.waitForNavigation();
  await page.click(".upload-flash-bypass > a");

  await page.type("#cp_make", makeSub);
  await page.evaluate(i => {
    $("#cp_contact_number").val(i.contactNumber);
    $("#cp_price").val(i.price);
    $("#cp_year").val(i.year);
    $("#cp_model").val(i.model);
    $("#cp_region").val(i.parish);
    $("#post_title").val(i.title);
    $("#post_content").val(i.description);
  }, i);

  var count = 1;

  // Run command for each image
  async function processImgs(i) {
    for (let e of i.imgs) {
      var uploadbtn = "#upload_" + count + " > input";
      var filename = "images/";
      filename += e.replace("https://www.autoadsja.com/vehicleimages/", "");
      await download(e, filename, async function() {});

      const fileInput = await page.$(uploadbtn);
      await fileInput.uploadFile(filename);

      count++;
    }
  }
  await processImgs(i);
  await setTimeout(async function() {
    await page.evaluate(() => {
      $("form#mainform").submit();
    });
  }, 3000);

  await page.waitForNavigation({});
  await page.evaluate(() => {
    $("form#mainform").submit();
  });
  await page.waitForNavigation();
  await browser.close();
  console.log("ad post confirmed");
}

// Image Downloader
function download(uri, filename, callback) {
  request.head(uri, function(err, res, body) {
    request(uri)
      .pipe(fs.createWriteStream(filename))
      .on("close", callback);
  });
}

async function scrapeAds(link) {
  await axios.get(link).then(async function(response) {
    // Then, we load that into cheerio and save it to $ for a shorthand selector
    var $ = cheerio.load(response.data);

    // Save an empty result object
    var result = {};

    // crawled variables
    var title = $(".price-tag > h1").text();
    var price = $(".price-tag > h2")
      .text()
      .replace(/[^0-9.-]+/g, "");
    // Add Formatted price to Title
    title += " - $" + price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

    var ymm = title.split(" "); // break Title into array of text
    var year = ymm[0];
    var make = ymm[1];
    var modelIndex = title.indexOf(make) + make.length + 1;
    var model = title.substring(modelIndex).replace(/\$.*/g, "");

    var location = $(".per-detail > ul > li")[0]
      .children[0].data.replace("Location: ", "")
      .replace(/\s+/g, "")
      .replace(".", ". ");

    var contact = $(".contact_details")
      .text()
      .replace(/[^0-9]+/g, "")
      .substring(0, 11);

    // Get Features for description
    var features = [];

    features.push($(".vehicle-description").text());

    $(".per-detail > ul > li").each(function(i) {
      features.push($(this).text());
    });

    features.push($(".contact_details").text());

    var description = "";
    features.forEach(function(element) {
      description += element.toString();
      description += "\n";
    });

    // Get Images
    var imgs = [];
    $(".product-images > .prod-box > a").each(function(i) {
      imgs.push($(this).attr("href"));
    });

    // Update Results object
    result.title = title;
    result.price = price;
    result.year = year;
    result.make = make;
    result.model = model;
    result.parish = location;
    result.contactNumber = contact;
    result.description = description;
    result.imgs = imgs;
    result.price = price;

    // Create a new Article using the `result` object built from scraping
    await db.Ads.create(result)
      .then(async function(ad) {
        postItem(ad);
      })
      .catch(function(err) {
        // If an error occurred, send it to the client
        console.log(err);
      });
  });
}

async function checkFeed(result) {
  await db.Feed.find({ link: result.link }, async function(err, docs) {
    if (docs.length) {
    } else {
      console.log("Ad Found!");
      await db.Feed.create(result)
        .then(function(feedItem) {
          scrapeAds(feedItem.link);
        })
        .catch(function(err) {
          console.log(err);
        });
    }
  });
}

const job = new CronJob("0 */10 * * * *", function() {
  axios.get("https://www.autoadsja.com/rss.asp").then(function(response) {
    // Then, we load that into cheerio and save it to $ for a shorthand selector
    var $ = cheerio.load(response.data, { xmlMode: true });

    $("item").each(async function(i, element) {
      var result = {};

      // Add the text and href of every link, and save them as properties of the result object
      result.link = $(this)
        .children("link")
        .text();
      result.title = $(this)
        .children("title")
        .text();
      result.img = $(this)
        .children("description")
        .text();

      await checkFeed(result);
    });
  });
  console.log("ads Checked");
});

// Start Cron Job Automation
job.start();

//============================================
//============================================
//============================================
// Routes
//============================================
//============================================

// Route for deleting all Articles from the db
app.get("/postItem", function(req, res) {
  // Grab every document in the Articles collection
  db.Ads.find({})
    .then(async function(dbArticle) {
      for (let i of dbArticle) {
        await postItem(i);
      }
    })
    .catch(function(err) {
      // If an error occurred, send it to the client
      console.log(err);
    });
  res.send("FinishedPosting");
});

// Route for getting all Articles from the db
app.get("/ads", function(req, res) {
  // Grab every document in the Articles collection
  db.Ads.find({})
    .then(function(dbArticle) {
      // If we were able to successfully find Articles, send them back to the client
      res.json(dbArticle.length);
    })
    .catch(function(err) {
      // If an error occurred, send it to the client
      res.json(err);
    });
});

// Route for saving/updating an Article's associated Note
app.post("/articles/:id", function(req, res) {
  // Create a new note and pass the req.body to the entry
  db.Note.create(req.body)
    .then(function(dbNote) {
      // If a Note was created successfully, find one Article with an `_id` equal to `req.params.id`. Update the Article to be associated with the new Note
      // { new: true } tells the query that we want it to return the updated User -- it returns the original by default
      // Since our mongoose query returns a promise, we can chain another `.then` which receives the result of the query
      return db.Article.findOneAndUpdate(
        { _id: req.params.id },
        { note: dbNote._id },
        { new: true }
      );
    })
    .then(function(dbArticle) {
      // If we were able to successfully update an Article, send it back to the client
      res.json(dbArticle);
    })
    .catch(function(err) {
      // If an error occurred, send it to the client
      res.json(err);
    });
});

// Route for deleting all Articles from the db
app.get("/clearFeed", function(req, res) {
  // Grab every document in the Articles collection
  db.Feed.remove({})
    .then(function(dbArticle) {
      // If we were able to successfully find Articles, send them back to the client
      res.json(dbArticle);
    })
    .catch(function(err) {
      // If an error occurred, send it to the client
      res.json(err);
    });
});

// Route for deleting all Articles from the db
app.get("/clearAds", function(req, res) {
  // Grab every document in the Articles collection
  db.Ads.remove({})
    .then(function(dbArticle) {
      // If we were able to successfully find Articles, send them back to the client
      res.json(dbArticle);
    })
    .catch(function(err) {
      // If an error occurred, send it to the client
      res.json(err);
    });
});

// Route for getting all Articles from the db
app.get("/feed", function(req, res) {
  // Grab every document in the Articles collection
  db.Feed.find({})
    .then(function(dbArticle) {
      // If we were able to successfully find Articles, send them back to the client
      res.json(dbArticle.length);
    })
    .catch(function(err) {
      // If an error occurred, send it to the client
      res.json(err);
    });
});

// // Route for getting all Articles from the db
app.get("/crawl", function(req, res) {
  axios.get("https://www.autoadsja.com/rss.asp").then(function(response) {
    // Then, we load that into cheerio and save it to $ for a shorthand selector
    var $ = cheerio.load(response.data, { xmlMode: true });
    var count;
    $("item").each(function(i, element) {
      var result = {};

      // Add the text and href of every link, and save them as properties of the result object
      result.link = $(this)
        .children("link")
        .text();
      result.title = $(this)
        .children("title")
        .text();
      result.img = $(this)
        .children("description")
        .text();

      checkFeed(result, function(res) {
        if (res) {
          count++;
        }
      });
    });
    res.send(count);
  });
});

// Route for getting all Articles from the db
app.get("/scrapeAds", function(req, res) {
  // Grab every document in the Articles collection
  db.Feed.find({})
    .then(function(dbArticle) {
      dbArticle.forEach(function(i, element) {
        scrapeAds(i.link);
      });

      // Send Scraped result to the front
      res.send("Scrape Successful");
    })
    .catch(function(err) {
      // If an error occurred, send it to the client
      res.json(err);
    });
});

// Start the server
app.listen(PORT, function() {
  console.log("App running on port " + PORT + "!");
});
