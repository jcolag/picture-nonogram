const fs = require('fs');
const im = require('imagemagick');
const superagent = require('superagent');

const minimumSize = 15;
const minColor = 0.35;
const maxColor = 0.75;
let defaultPercentBlack = 66;

const smallFilename = 'test-small.png';
const bwFilename = 'test-bw.png';
let imageFilename = 'downloaded-image.jpg';
let targetWidth = -1;
let targetHeight = -1;

if (process.argv.length < 3) {
  downloadRandomImageList();
} else {
  imageFilename = process.argv[2];
  processExistingImage(process.argv[2]);
}

function downloadRandomImageList() {
  superagent
    .get('https://pxhere.com/en/random')
    .end((err, res) => {
      if (err) {
        console.log(err);
        return;
      }

      if (res.status !== 200) {
        console.log(`Failed with HTTP status code ${res.status}.`);
        return;
      }

      downloadAndProcessImage(res.text);
    });
}

function downloadAndProcessImage(html) {
  const line = html
    .split('\n')
    .filter((line) => line.indexOf('<a href="/en/photo/') >= 0)
    [3];
  const src = ' src="';
  const urlStart = line.indexOf(src) + src.length;
  const urlEnd = line.indexOf('"', urlStart);
  const url = line.slice(urlStart, urlEnd);

  superagent
    .get(url)
    .end((err, res) => {
      if (err) {
        console.log(err);
        return;
      }

      if (res.status !== 200) {
        console.log(`Download failed with HTTP status code ${res.status}.`);
        return;
      }

      fs.writeFileSync(imageFilename, res.body);
      im.identify(imageFilename, processFileInfo);
    });
}

function processExistingImage(filename) {
  im.identify(filename, processFileInfo);
}

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

  if (targetWidth > minimumSize && targetHeight > minimumSize) {
    const newRatio = simplifyAspectRatio(targetWidth / targetHeight, 50);

    targetWidth = newRatio[0];
    targetHeight = newRatio[1];
  }

  if (targetWidth < minimumSize || targetHeight < minimumSize) {
    let aspect = {
      height:  targetHeight,
      width:  targetWidth,
    };
    const smaller = targetWidth < targetHeight ? "width" : "height";
    const larger = targetWidth < targetHeight ? "height" : "width";
    const ratio = minimumSize / aspect[smaller];

    aspect[smaller] = minimumSize;
    aspect[larger] = Math.trunc(aspect[larger] * ratio + 0.5);
    targetHeight = aspect.height;
    targetWidth = aspect.width;
  }

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

function processSmallImage(err, stdout, percentage) {
  if (err) {
    throw err;
  }

  if (percentage === '') {
    percentage = defaultPercentBlack;
  }

  // Now that we have a smaller image, convert it to black-and-white.
  im.convert(
    [
      smallFilename,
      '-negate',
      '-threshold',
      `${percentage}%`,
      '-negate',
      bwFilename
    ],
    processBwImage
  );
}

function processBwImage(err, stdout) {
  if (err) {
    throw err;
  }

  // This dumps a test description of each pixel, its coordinates
  // and color.
  im.convert(
    [
      bwFilename,
      'txt:'
    ],
    processBits
  );
}

function processBits(err, stdout) {
  if (err) {
    throw err;
  }

  // Create a grid of the target size.
  const grid = Array.from(Array(targetHeight), () => new Array(targetWidth));
  // Hack up the text output for processing.
  const lines = stdout
    .split('\n')
    .map((l) => l.split(' '))
    .slice(1);
  const RleByRow = [];
  const RleByColumn = [];
  let row = 0;
  let column = 0;

  lines.forEach((l) => {
    if (l.length > 1) {
      // For the lines that are meaningful (not headers or empty),
      // plug the color into that location on a right-sized grid.
      const coord = l[0].slice(0, -1).split(',');
      const color = l[5].indexOf(0) < 0 ? 1 : 0;

      grid[Number(coord[1])][Number(coord[0])] = color;
    }
  });
  for (let i = 0; i < targetHeight; i++) {
    // For each row...
    RleByRow.push(encodeRun(grid[i]));
  }

  for (let j = 0; j < targetWidth; j++) {
    const column = grid.map((row) => row[j]);

    // For each column...
    RleByColumn.push(encodeRun(column));
  }

  stripRle(RleByRow, 0);
  stripRle(RleByColumn, 0);

  const onBits = RleByRow
    .map((row) => row.reduce((a, b) => a + b, 0))
    .reduce((a, b) => a + b)
    / (targetWidth * targetHeight);

  if (onBits > maxColor) {
    defaultPercentBlack += 1;
    processSmallImage(null, null, defaultPercentBlack);
    return;
  } else if (onBits < minColor) {
    defaultPercentBlack -= 1;
    processSmallImage(null, null, defaultPercentBlack);
    return;
  }

  const image = encodeImage(imageFilename);
  let html = '<html>\n<head>\n';

  html += '<link rel="stylesheet" href="style.css" charset="utf-8">\n';
  html += '<script type="text/javascript">\n';
  html += '  const grid = [\n';
  grid.forEach((row) => {
    html += '    [';
    row.forEach((cell) => {
      html += `[${cell}],`;
    });
    html += '],\n';
  });
  html += '  ];\n';
  html += '  function handleClick(row, col) {\n';
  html += '    const el = document.getElementById(`${row}-${col}`);\n';
  html += '    el.classList.remove("off");\n';
  html += '    el.classList.add("on");\n';
  html += '    grid[row][col].push(1);\n';
  html += '    checkGrid();\n';
  html += '  }\n';
  html += '  function handleContextmenu(row, col) {\n';
  html += '    const el = document.getElementById(`${row}-${col}`);\n';
  html += '    el.classList.remove("on");\n';
  html += '    el.classList.add("off");\n';
  html += '    grid[row][col].push(0);\n';
  html += '    checkGrid();\n';
  html += '  }\n';
  html += '  function handleMouseEnter(row, col) {\n';
  html += '    const rowHead = document.getElementById(`row-${row}`);\n';
  html += '    const colHead = document.getElementById(`col-${col}`);\n';
  html += '    rowHead.classList.add("highlight");\n';
  html += '    colHead.classList.add("highlight");\n';
  html += '  }\n';
  html += '  function handleMouseLeave(row, col) {\n';
  html += '    const rowHead = document.getElementById(`row-${row}`);\n';
  html += '    const colHead = document.getElementById(`col-${col}`);\n';
  html += '    rowHead.classList.remove("highlight");\n';
  html += '    colHead.classList.remove("highlight");\n';
  html += '  }\n';
  html += '  function checkGrid() {\n';
  html += '    const comparison = grid\n';
  html += '      .map((row) => row\n';
  html += '        .map((cell) => [\n';
  html += '          1 - cell[0],\n';
  html += '          cell.length > 1 ? cell.slice(-1)[0] : -1\n';
  html += '        ])\n';
  html += '      )\n';
  html += '      .map((row) => row\n';
  html += '        .map((cell) => cell[0] === cell[1] ||';
  html += ' (cell[0] === 0 && cell[1] < 0))\n';
  html += '      )\n';
  html += '      .map((row) => row.filter((cell) => !cell))\n';
  html += '      .filter((row) => row.length > 0);\n';
  html += '    const image = document.getElementById("result");\n';
  html += '    const slider = document.getElementById("opacity");\n';
  html += '    if (comparison.length === 0) {\n';
  html += '      image.classList.remove("hidden");\n';
  html += '      slider.classList.remove("hidden");\n';
  html += '    }\n';
  html += '  }\n';
  html += '  function changeImageOpacity(o) {\n';
  html += '    const image = document.getElementById("result");\n';
  html += '    image.style.opacity = (o/100).toString();\n';
  html += '  }\n';
  html += '</script>\n';
  html += '</head>\n<body>\n  <table>\n    <tr>\n      <th>';
  html += `${grid[0].length}x${grid.length} puzzle</th>\n`;
  for (let col = 0; col < RleByColumn.length; col++) {
    header = RleByColumn[col].join('<br>');
    html += `      <th class="ch" id="col-${col}">${header}</th>\n`;
  }

  html += '    </tr>\n';
  for (let row = 0; row < RleByRow.length; row++) {
    header = RleByRow[row].join('&nbsp;&nbsp;');
        if (header.length === 0) {
      header = '&nbsp;';
    }

    html += `    <tr>\n      <th class="rh" id="row-${row}">${header}</th>\n`;
    for (col = 0; col < RleByColumn.length; col++) {
      html += `      <td id="${row}-${col}"`;
      html += ` onclick="handleClick(${row},${col})"`
      html += ` oncontextmenu="handleContextmenu(${row},${col}); return false;"`
      html += ` onmouseenter="handleMouseEnter(${row},${col})"`
      html += ` onmouseleave="handleMouseLeave(${row},${col})"`
      html += '></td>\n';
    }
    html += '    </tr>\n';
  }

  html += '  </table>\n';
  html += '  <img class="hidden" id="result"';
  html += ` style="width: calc(${RleByColumn.length}*1.58em)"`;
  html += ` src="data:image/png;base64,${image}">\n`;
  html += '  <div id="opacity" class="slidecontainer hidden">\n';
  html += '    Opacity:\n';
  html += '    <input type="range" min="1" max="100" value="75"';
  html += ' oninput="changeImageOpacity(this.value)"';
  html += ' class="slider" id="opacity-range">\n';
  html += '  </div>\n';
  html += '</body>\n';
  fs.writeFileSync('output.html', html);
  fs.unlinkSync(smallFilename);
  fs.unlinkSync(bwFilename);
}

function gcd(a, b) {
  // This is just a utility function to find the greatest common
  // denominator of two numbers.
  if (b === 0) {
    return a;
  }

  return gcd(b, a % b);
}

function stripRle(encoding, valueToKeep) {
  const height = encoding.length;

  for (i = 0; i < height; i++) {
    const newRow = encoding[i]
      .filter((tuple) => tuple[0] === valueToKeep)
      .map((tuple) => tuple[1]);

    while (newRow[0] === 0) {
      newRow.shift();
    }

    encoding[i] = newRow;
  }
}

function encodeRun(bits) {
  const encoding = [];
  let currentTotal = 0;
  let currentColor = 0;
  let count = 0;

  while (count < bits.length) {
    // Count the consecutive cells for each color.
    // This is, essentially, run-length encoding.
    if (currentColor !== bits[count]) {
      // Reset when the color changes.
      encoding.push([currentColor, currentTotal]);
      currentColor = bits[count];
      currentTotal = 0;
    }

    count += 1;
    currentTotal += 1;
  }

  encoding.push([currentColor, currentTotal]);
  return encoding;
}

function simplifyAspectRatio(val, lim) {
  // This code comes from https://stackoverflow.com/a/43016456/3438854
  // by ccpizza (https://stackoverflow.com/users/191246/ccpizza),
  // licensed CC-BY-SA 3.0
  var lower = [0, 1];
  var upper = [1, 0];

  while (true) {
    var mediant = [lower[0] + upper[0], lower[1] + upper[1]];

    if (val * mediant[1] > mediant[0]) {
      if (lim < mediant[1]) {
        return upper;
      }
      lower = mediant;
    } else if (val * mediant[1] == mediant[0]) {
      if (lim >= mediant[1]) {
        return mediant;
      }
      if (lower[1] < upper[1]) {
        return lower;
      }
      return upper;
    } else {
      if (lim < mediant[1]) {
        return lower;
      }
      upper = mediant;
    }
  }
}

function encodeImage(filename) {
  imageBinary = fs.readFileSync(filename);
  return imageBinary.toString('base64');
}

