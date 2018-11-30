var mongoose = require("mongoose");

// Save a reference to the Schema constructor
var Schema = mongoose.Schema;

// Using the Schema constructor, create a new UserSchema object
// This is similar to a Sequelize model
var AdsSchema = new Schema({
  // `title` is required and of type String
  title: {
    type: String,
    required: true
  },
  // `link` is required and of type String
  description: {
    type: String,
    required: true
  },
  // `title` is required and of type String
  imgs: {
    type: Array,
    required: true
  },
  // `link` is required and of type interger
  price: {
    type: Number,
    required: true
  },
  contactNumber: {
    type: Number,
    required: true
  },
  year: {
    type: Number,
    required: true
  },
  make: {
    type: String,
    require: true
  },
  model: {
    type: String,
    require: true
  },
  parish: {
    type: String,
    require: true
  }
});

// This creates our model from the above schema, using mongoose's model method
var Ads = mongoose.model("Ads", AdsSchema);

// Export the Article model
module.exports = Ads;
