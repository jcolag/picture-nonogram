const fs = require('fs');
const im = require('imagemagick');

if (process.argv.length < 3) {
  console.log(`${process.argv[1]} requires an image file.`);
  process.exit(1);
}

const smallFilename = 'test-small.png';
const bwFilename = 'test-bw.png';
let imageFilename = process.argv[2];
let targetWidth = -1;
let targetHeight = -1;

im.identify(imageFilename, processFileInfo);

function processFileInfo(err, features) {
  if (err) {
    throw err;
  }

  // We now have the height and width, and now want to reduce it.
  // This assumes that the image is a usable size, though.  If the image
  // is square or has been manually cropped, the shrunken image is
  // going to either be too small (1x1) or too large (301x782) to work
  // with.
  const divisor = gcd(features.width, features.height);

  targetWidth = features.width / divisor;
  targetHeight = features.height / divisor;
  im.convert(
    [
      imageFilename,
      '-resize',
      `${targetWidth}x${targetHeight}`,
      smallFilename
    ],
    processSmallImage
  );
}

function processSmallImage(err, stdout) {
  if (err) {
    throw err;
  }

  // Now that we have a smaller image, convert it to black-and-white.
}

function gcd(a, b) {
  // This is just a utility function to find the greatest common
  // denominator of two numbers.
  if (b === 0) {
    return a;
  }

  return gcd(b, a % b);
}

