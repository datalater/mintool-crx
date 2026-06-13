const colors = {
  default: "#aaa",
  primary: "#007bff",
  green: "#4CAF50",
};

function log(msg) {
  console.log(
    `%c[MINTOOL] ${JSON.stringify(msg, null, 2)}`,
    `color: ${colors.green}`
  );
}

log("Content script loaded");
