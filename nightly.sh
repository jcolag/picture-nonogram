#!/bin/sh
archive="${HOME}/www/nono/archive.html"
today=$(faketime '1 day ago' date '+%Y%m%d')
newdir="${HOME}/www/nono/${today}"
mkdir "${newdir}"
mv ${HOME}/www/nono/index.html "${newdir}"
/usr/bin/node ${HOME}/apps/picture-nonogram/nono.js
mv ${HOME}/apps/picture-nonogram/output.html ${HOME}/www/nono/index.html
ln -s "${HOME}/www/nono/style.css" "${newdir}/style.css"
echo "<!DOCTYPE html><html lang='en-US'><head>" > "${archive}"
echo "<title>Archives</title>" >> "${archive}"
echo "<link rel='stylesheet' href='/nono/style.css' charset='utf-8'>" >> "${archive}"
echo "</head><body>" >> "${archive}"
echo "<h1>Nonogram Archives</h1><ul>" >> "${archive}"
for old in $(find "${HOME}/www/nono/" -type d -print | grep '[0-9]')
do
  dd=$(echo "${old}" | rev | cut -f1 -d'/' | rev)
  echo "<li><a href='/nono/${dd}'>${dd}</a></li>" >> "${archive}"
done
echo "</ul></body></html>" >> "${archive}"

