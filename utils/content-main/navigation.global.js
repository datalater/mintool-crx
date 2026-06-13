const EVENT_PUSH_STATE = "[mintool] custom-push-state";
const EVENT_REPLACE_STATE = "[mintool] custom-replace-state";

if (window.top === window.self) {
  monkeyPatchPushState();
  monkeyPatchReplaceState();
}

function monkeyPatchPushState() {
  const originalPushState = history.pushState;

  history.pushState = function (...args) {
    const result = originalPushState.apply(history, args);

    const navEvent = new CustomEvent(EVENT_PUSH_STATE);
    window.dispatchEvent(navEvent);

    return result;
  };
}

function monkeyPatchReplaceState() {
  const originalReplaceState = history.replaceState;

  history.replaceState = function (...args) {
    const result = originalReplaceState.apply(history, args);

    const navEvent = new CustomEvent(EVENT_REPLACE_STATE);
    window.dispatchEvent(navEvent);

    return result;
  };
}
