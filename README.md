# egpt-godsworld — PROD app

The DeSciX PROD home for Gods World, Maxi's Lab. Served at **https://egpt-godsworld.descix.net/**;
godsworld.ai forwards there.

## Layout

```
site/                      the only directory uploaded as the site
  index.html               front page — generated from the shared EGPT front-page template
                           and the egpt-godsworld content block in
                           EGPT-Evidence site-src/frontpage/; a query-string load forwards to app.html
  share.json, images/share/  the share card: title, description, favicon, 180 icon, 1200×630 image
  images/*                 front-page images
  DeSciXAppSDK.js          DeSciX app-side SDK, vendored
  app-assets/maxi-host-view.js  the one view declaration for index.html and app.html: NoChrome on a phone, CodeSite
                           otherwise, through the package's @descix/frqtl-web/host-view declarer
  app.html                 Maxi's Lab: the whole frame, Maxi's conversation in its own panel (app-assets/maxi-lab.js)
  scene.html               the scene document Maxi's Lab replaces per load
  vendor/frqtl-web/        the pinned @descix/frqtl-web dist (vendor/frqtl-web/PINNED.json)
  memories/                per memory: its filmed clip and stills, plus tile.png when its card has a tile
                           (atomic-model: tile only, no clip yet)
```
