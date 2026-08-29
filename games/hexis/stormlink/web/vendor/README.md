# vendor

`three.min.js` — three.js r128, MIT licensed, © 2010–2021 three.js authors.
Vendored so the client runs with no network at all; `index.html` falls back to
the CDN if this file is missing.

To refresh it:

    npm pack three@0.128.0 && tar xzf three-0.128.0.tgz
    cp package/build/three.min.js web/vendor/three.min.js
