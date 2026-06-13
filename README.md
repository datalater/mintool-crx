# README

- [모듈화 방법](#모듈화-방법)
- [실행 컨텍스트별 폴더 구조](#실행-컨텍스트별-폴더-구조)
- [전역 변수 선언 규칙](#전역-변수-선언-규칙)
- [파일 로딩 방식](#파일-로딩-방식)
- [북마클릿 추가 방법](#북마클릿-추가-방법)
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
      "run_at": "document_start",
    },
    // content script에서 사용할 전역 변수를 추가합니다.
    // - 효과: content script에서 선언한 모든 변수는 다른 content script에서 사용할 수 있습니다.
    {
      "js": ["lib/global.js", "lib/components.js", "lib/log.js"],
      "matches": ["<all_urls>"],
    },
    {
      "js": ["scripts/ad-block.js", "scripts/github.js"],
      "matches": ["<all_urls>"],
    },
  ],
}
```

## 실행 컨텍스트별 폴더 구조

확장 파일은 `manifest.json 또는 background.js가 파일을 지정하고 → 크롬이 지정된 실행 컨텍스트에서 파일을 평가하고 → 그 컨텍스트의 전역과 DOM/API 사용 가능 범위가 결정된다.`

```txt
background.js
  - 루트에 둔다.
  - service worker에서 실행된다.
  - document/window가 없다.
  - importScripts(...)로 service worker에서 안전한 파일만 읽는다.

services/
  bookmarklets/
    registry.global.js
      - 북마클릿 id/title/run 목록이다.
      - background.js가 메뉴 생성을 위해 읽는다.
      - 탭에 동적으로 주입되어 run()도 실행된다.
      - top-level에서는 document/window/NodeFilter를 쓰지 않는다.

  dom-tools/content-isolated/
    - DOM 제거, DOM 스타일 편집처럼 extension 메시지와 페이지 DOM을 함께 쓰는 기능이다.

  virtual-fullscreen/
    content-isolated.js
      - background 메시지, toast, MAIN world 브릿지를 담당한다.
    content-main.js
      - 페이지 JS가 직접 쓰는 fullscreen API/prototype을 패치한다.

  github/content-isolated/
  jira/
  toss-invest/
  ad-block/
    - 사이트 또는 서비스 단위 기능이다.

utils/
  content-isolated/
    global.global.js
    - `utils/content-isolated/global.global.js`
    - mintool.observeUrlChange, createElement, templateToElement처럼 여러 content script가 공유하는 helper이다.

    - 여러 서비스가 재사용하는 isolated content script 전용 유틸이다.
    - document/window와 chrome.runtime 일부를 쓸 수 있다.

  content-main/
    navigation.global.js
    - `utils/content-main/navigation.global.js`
    - history.pushState/replaceState를 패치해 isolated content script가 URL 변경 이벤트를 받을 수 있게 한다.

    - 페이지 JS 전역, history, prototype, window를 만져야 하는 MAIN world 전용 유틸이다.

  vendor/
    - 외부 라이브러리를 그대로 둔다.
```

기본 판단 기준:

```txt
페이지 JS가 직접 호출하는 함수/prototype/history/window를 바꿔야 한다
→ content-main

DOM 조작, extension 메시지, storage, 보조 UI를 처리한다
→ content-isolated

background.js 또는 importScripts(...)에서 읽힌다
→ service worker에서도 안전해야 하므로 top-level document/window 금지
```

## 전역 변수 선언 규칙

classic script는 `파일을 평가하고 → top-level var/function을 현재 실행 컨텍스트의 globalThis 프로퍼티로 만들고 → const/let은 globalThis 프로퍼티로 만들지 않는다.`

```js
var A = 1;
function B() {}
const C = 3;
let D = 4;

globalThis.A; // 1
globalThis.B; // function
globalThis.C; // undefined
globalThis.D; // undefined
```

단, `globalThis`는 실행 컨텍스트마다 다르다.

```txt
service worker globalThis
!= content script isolated globalThis
!= content script MAIN/page globalThis
!= popup/settings globalThis
```

전역 노출을 의도한 파일은 `*.global.js` 접미사를 쓴다. 다른 파일에서 이름으로 참조해야 하는 값은 `var` 또는 `function`으로 선언하고, 내부 구현 값은 `const`/`let`으로 선언한다.

## 파일 로딩 방식

service worker는 `background.js가 실행되고 → importScripts(...)가 파일을 순서대로 평가하고 → 같은 service worker globalThis에서 전역 이름을 참조한다.`

```js
importScripts("services/bookmarklets/registry.global.js");
```

manifest content script는 `matches에 맞는 페이지가 열리고 → js 배열 순서대로 파일을 평가하고 → 지정된 world에서 전역 이름을 공유한다.`

```jsonc
{
  "matches": ["<all_urls>"],
  "js": [
    "utils/content-isolated/feature-guard.global.js",
    "utils/content-isolated/components.global.js",
    "services/dom-tools/content-isolated/eraser.js",
  ],
}
```

MAIN world content script는 페이지 JS와 같은 world에서 실행해야 할 때만 사용한다.

```jsonc
{
  "matches": ["<all_urls>"],
  "world": "MAIN",
  "run_at": "document_start",
  "js": [
    "utils/content-main/navigation.global.js",
    "services/virtual-fullscreen/content-main.js",
  ],
}
```

동적 주입은 `사용자 액션이 발생하고 → background.js가 target tab을 고르고 → chrome.scripting.executeScript({ files })가 파일을 순서대로 주입한다.`

```js
await chrome.scripting.executeScript({
  target: { tabId },
  files: [
    "utils/content-isolated/popup.global.js",
    "services/bookmarklets/registry.global.js",
  ],
});
```

`importScripts`는 content script에서 의존성을 불러오는 일반 방법이 아니다. Content script 의존성은 `manifest.json`의 `js` 배열 순서나 `chrome.scripting.executeScript({ files })` 순서로 표현한다.

## 북마클릿 추가 방법

북마클릿은 `background.js가 registry를 읽어 메뉴를 만들고 → 사용자가 메뉴를 클릭하고 → content-isolated 유틸과 registry를 탭에 주입하고 → id로 북마클릿을 찾아 run()을 실행한다.`

새 북마클릿은 `services/bookmarklets/registry.global.js`의 `MINTOOL_BOOKMARKLETS`에 객체를 추가한다.

```js
{
  id: "my-bookmarklet",
  title: "my-bookmarklet",
  run: function myBookmarklet() {
    // 탭에서 실행될 코드
  },
}
```

`run()` 안에서는 `document`를 사용할 수 있지만, registry 파일의 top-level에서는 사용할 수 없다. Popup처럼 여러 북마클릿이 재사용하는 DOM 유틸은 `utils/content-isolated/popup.global.js`에 추가하고 `MINTOOL_CONTENT_POPUP.show(...)`처럼 호출한다.

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
