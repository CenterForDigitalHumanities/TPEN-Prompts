# Task: detect the first text line on a TPEN3 page and create a line annotation (fast)

Do each step once. Do not verify, recheck, or retry.

## Context

- Project: {{projectID}}
- Page: {{pageID}}
- Canvas: {{canvasId}}
- Canvas dimensions: {{dims}}
- Image: {{imageUrl}}
- User Agent URI: {{userAgentURI}}

## Step 0 — Abort if the page already has lines

GET `{{pageEndpoint}}` with `Accept: application/json` and `Authorization: Bearer {{token}}`. If `items` is non-empty, print `ABORT: page already has lines` and stop. If the GET is non-2xx, print `ABORT: page GET <status>` and stop.

## Step 1 — Fetch a small derivative

The Image URL has the form `{base}/{region}/{size}/{rotation}/{quality}.{fmt}`. Strip the last four path segments to get `{base}`, then GET `{base}/full/600,/0/default.jpg`. Record the returned image's pixel dimensions as `(Dw, Dh)`.

## Step 2 — Locate the first line (one vision pass)

In that derivative, identify the bounding box of the topmost inked text line of the main text block. A slightly generous box is fine. Record `(x, y, w, h)` in derivative pixels.

## Step 3 — Scale to canvas and clamp

Using canvas dimensions `(Cw, Ch)` from the context above:

```
X = round(x * Cw / Dw)
Y = round(y * Ch / Dh)
W = round(w * Cw / Dw)
H = round(h * Ch / Dh)
```

Clamp so `X >= 0`, `Y >= 0`, `X + W <= Cw`, `Y + H <= Ch`.

## Step 4 — POST the annotation

POST to `{{lineEndpoint}}` with `Content-Type: application/json`, `Accept: application/json`, `Authorization: Bearer {{token}}`, and this exact body (substitute the clamped `X, Y, W, H`):

```json
{
  "@context": "http://iiif.io/api/presentation/3/context.json",
  "type": "Annotation",
  "motivation": "transcribing",
  "target": {
    "source": "{{canvasId}}",
    "type": "SpecificResource",
    "selector": {
      "type": "FragmentSelector",
      "conformsTo": "http://www.w3.org/TR/media-frags/",
      "value": "xywh=pixel:<X>,<Y>,<W>,<H>"
    }
  },
  "body": [],
  "creator": "{{userAgentURI}}"
}
```

On non-2xx, print the status and body and stop. Do not retry.

## Output

Print the POST HTTP status and response body. Nothing else.
