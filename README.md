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
  app-assets/host-view.js  the one view declarer: asks the DeSciX host for the whole frame (CodeSite) for index.html and app.html
  app.html                 Maxi's Lab: the whole frame, Maxi's conversation in its own panel (app-assets/maxi-lab.js)
  scene.html               the scene document Maxi's Lab replaces per load
  vendor/frqtl-sdk/        the pinned @descix/frqtl-sdk dist (vendor/frqtl-sdk/PINNED.json)
  memories/                per memory: its filmed clip and stills, plus tile.png when its card has a tile
                           (atomic-model: tile only, no clip yet)
```
