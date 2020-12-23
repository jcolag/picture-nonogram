const fs = require('fs');
const im = require('imagemagick');

if (process.argv.length < 3) {
  console.log(`${process.argv[1]} requires an image file.`);
  process.exit(1);
}

let imageFilename = process.argv[2];
