Drop the original photos here (JPG, PNG or WebP), named after the image in
data/site/website.json, then run `npm run images` in site/. Each becomes
site/public/img/<name>.webp (at most 1000 px wide) plus <name>-600.webp for phones.

The Organt photos the page is waiting for:
- organt-lookbook.jpg   (the "New, limited collection" lookbook, portrait)
- organt-area-code.jpg  (the Area Code tee, square)
- organt-jozi-10.jpg    (Jozi Number 10, square)
- organt-matcha-girly.jpg (the Matcha Girly baby tee, square)

Until a photo is there, the page draws a stand-in tee. The originals in this
folder are not committed (only this README); the WebP files are.
The poster comes from the game's own public/cover.jpg, so it is not here.
