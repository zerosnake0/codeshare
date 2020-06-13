const g = require('./global.js');

const group = (msg, ...args) => {
  if (g.codeshare.debug) {
    console.group(msg, ...args);
  }
};
const groupEnd = () => {
  if (g.codeshare.debug) {
    console.groupEnd();
  }
};
const info = (msg, ...args) => {
  if (g.codeshare.debug) {
    console.log(msg, ...args);
  }
};

module.exports = {
  group,
  groupEnd,
  info
};