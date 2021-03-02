#!/bin/sh
today=$(faketime '1 day ago' date '+%Y%m%d')
newdir="${HOME}/www/nono/${today}"
mkdir "${newdir}"
mv ${HOME}/www/nono/index.html "${newdir}"
/usr/bin/node ${HOME}/apps/picture-nonogram/nono.js
mv ${HOME}/apps/picture-nonogram/output.html ${HOME}/www/nono/index.html

