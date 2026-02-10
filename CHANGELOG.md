## 1.0.13 - 2026-02-10

### Bug Fixes

* Switch to alphabetic baseline with font metrics for precise text alignment
* Optimize font metrics calculation using a singleton canvas and caching
* Fix race condition in font inlining where CSS was stringified before fetches finished
* Support @font-face rules in internal style sheets and improve URL resolution

## 1.0.12 - 2025-11-12

### Bug Fixes

* Fix overflow: hidden mask handling to support border-radius
* Fix isInFlow logic for element flow detection
* Improve border-radius support for individual corners
* Fix text fill attribute handling to preserve existing SVG fills


## 1.0.11 - 2025-05-27

### Bug Fixes

* Fix img visibility


## 1.0.10 - 2025-05-22

### Bug Fixes

* Fix newline
* Fix dashed


## 1.0.9 - 2024-08-06

### Bug Fixes

* Fix text-decoration


## 1.0.8 - 2024-07-31

### Features

* Support inlineSvg options

### Bug Fixes

* Modify the default values of SVG


## 1.0.7 - 2024-06-13

### Bug Fixes

* Support for application/octet-stream


## 1.0.6 - 2024-04-28

### Features

* fetch options


## 1.0.5 - 2024-04-09

### Features

* update dependencies and devDependencies


## 1.0.4 - 2023-12-28

### Features

* export fetchResource blobToDataURL
* update devDependencies


## 1.0.3 - 2023-12-07

### Bug Fixes

* Remove leading and trailing whitespace


## 1.0.2 - 2023-12-06

### Bug Fixes

* Use xlink:href additionally to href in img


## 1.0.1 - 2023-12-06

### Features

* Update README


## 1.0.0 - 2023-12-06

### Features

* Refactor dom-to-svg

### Bug Fixes

* Safari returns 2 DOMRects when wrapping text