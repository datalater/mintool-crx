# README

- [모듈화 방법](#모듈화-방법)
- [함께 읽기](#함께-읽기)

## 모듈화 방법

```jsonc
{
  "content_scripts": [
    // globalThis(window) 객체에 전역 변수를 추가합니다.
    // - 효과: 브라우저에서 실행되는 모든 스크립트는 여기서 추가한 전역 변수를 사용할 수 있습니다.
    {
      "js": ["lib/global.js"],
      "matches": ["<all_urls>"],
      "world": "MAIN",
      "run_at": "document_start"
    },
    // content script에서 사용할 전역 변수를 추가합니다.
    // - 효과: content script에서 선언한 모든 변수는 다른 content script에서 사용할 수 있습니다.
    {
      "js": ["lib/global.js", "lib/components.js", "lib/log.js"],
      "matches": ["<all_urls>"]
    },
    {
      "js": ["scripts/ad-block.js", "scripts/github.js"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

## 함께 읽기

크롬 확장에서 콘텐츠 스크립트 간에 모듈을 공유하는 방법:

- https://stackoverflow.com/a/58137279

크롬 확장 만드는 법:

- [Chrome for Developers - 모든 페이지에서 스크립트 실행](https://developer.chrome.com/docs/extensions/get-started/tutorial/scripts-on-every-tab?hl=ko)
- [GoogleChrome/chrome-extensions-samples: images](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/functional-samples/tutorial.reading-time/images)

PNG 이미지를 아이콘으로 변환하기:

- https://pixlr.com/kr/express/
- https://www.iloveimg.com/resize-image/resize-png#resize-options,pixels

네트워크 요청 차단 (ex. 광고 스크립트):

- [Chrome for Developers - chrome.declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest?hl=ko)
